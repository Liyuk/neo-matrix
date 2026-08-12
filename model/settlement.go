package model

import (
	"log"
	"time"

	"gorm.io/gorm"
)

// QuotaToRMB 把 quota 换算成人民币（1 美元 = 500,000 quota，汇率 7）。
// 汇率常量引用 ratio 包的约定，这里单独实现避免 import cycle。
const QuotaToRMB = 7.0 / 500000

// SettlementPeriod 结算周期（默认按天）。
const SettlementPeriodDay = 86400 // seconds

// SettlementItem 单条聚合结果：某渠道在某周期的消费汇总。
type SettlementItem struct {
	ChannelId int
	TotalQuota int
	CostQuota  int
}

// AggregateConsumeLogs 聚合指定周期内 type=2(消费) 日志，按渠道分组。
func AggregateConsumeLogs(start int64, end int64) ([]SettlementItem, error) {
	type row struct {
		ChannelId  int
		TotalQuota int
		CostQuota  int
	}
	var rows []row
	// LOG_DB 可能独立于主库；日志的 created_at 是 unix 秒
	err := LOG_DB.Table("logs").
		Select("channel_id, SUM(quota) as total_quota, SUM(cost_quota) as cost_quota").
		Where("type = ?", LogTypeConsume).
		Where("created_at >= ? AND created_at < ?", start, end).
		Where("channel_id > 0").
		Group("channel_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	items := make([]SettlementItem, 0, len(rows))
	for _, r := range rows {
		items = append(items, SettlementItem{
			ChannelId:  r.ChannelId,
			TotalQuota: r.TotalQuota,
			CostQuota:  r.CostQuota,
		})
	}
	return items, nil
}

// GenerateSettlement 为某周期生成结算单（幂等：同周期同渠道只生成一次）。
// 返回生成的结算单数量。
func GenerateSettlement(periodStart int64, periodEnd int64) (int, error) {
	items, err := AggregateConsumeLogs(periodStart, periodEnd)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, item := range items {
		channel, err := GetChannelById(item.ChannelId, false)
		if err != nil || channel == nil || channel.OwnerId == 0 || channel.SettleEnabled != 1 {
			continue // 平台自有渠道或已删除，不参与分成
		}
		supplier, err := GetSupplierByUserId(channel.OwnerId)
		if err != nil {
			continue
		}
		// 分成计算：利润 = 零售 - 成本；供给方得 cost + 利润×(1-platform_ratio)
		// 边界：成本 >= 零售时（负利润），供给方最多拿成本（上限=零售），平台不补贴、不留负数。
		profit := item.TotalQuota - item.CostQuota
		platformRatio := supplier.PlatformRatio
		if platformRatio <= 0 || platformRatio > 1 {
			platformRatio = 0.2
		}
		revenueQuota := item.CostQuota + int(float64(profit)*(1-platformRatio))
		if revenueQuota < 0 || revenueQuota > item.TotalQuota {
			revenueQuota = item.TotalQuota
		}
		platformQuota := item.TotalQuota - revenueQuota

		// 幂等检查：同周期同渠道已存在则更新
		var existing Settlement
		err = DB.Where("period_start = ? AND period_end = ? AND channel_id = ?", periodStart, periodEnd, item.ChannelId).First(&existing).Error
		settlement := Settlement{
			PeriodStart:   periodStart,
			PeriodEnd:     periodEnd,
			SupplierId:    supplier.Id,
			ChannelId:     item.ChannelId,
			TotalQuota:    item.TotalQuota,
			CostQuota:     item.CostQuota,
			RevenueQuota:  revenueQuota,
			PlatformQuota: platformQuota,
			Status:        SettlementStatusPending,
			CreatedTime:   time.Now().Unix(),
		}
		if err == nil {
			// 已存在：若已确认/已入账则跳过，否则更新为最新聚合值
			if existing.Status >= SettlementStatusConfirmed {
				continue
			}
			settlement.Id = existing.Id
			if err := DB.Model(&Settlement{}).Where("id = ?", existing.Id).Updates(map[string]interface{}{
				"total_quota":    item.TotalQuota,
				"cost_quota":     item.CostQuota,
				"revenue_quota":  revenueQuota,
				"platform_quota": platformQuota,
				"status":         SettlementStatusPending,
				"created_time":   time.Now().Unix(),
			}).Error; err != nil {
				return count, err
			}
			count++
			continue
		}
		if err := DB.Create(&settlement).Error; err != nil {
			return count, err
		}
		// 计入结算中余额
		_ = UpdateSupplierBalance(supplier.UserId, revenueQuota, "settling")
		count++
	}
	return count, nil
}

// GetSettlementsBySupplier 某供给方的结算记录
func GetSettlementsBySupplier(supplierId int) ([]*Settlement, error) {
	var settlements []*Settlement
	err := DB.Where("supplier_id = ?", supplierId).Order("period_start desc").Find(&settlements).Error
	return settlements, err
}

// GetAllSettlements 所有结算记录（管理端）
func GetAllSettlements() ([]*Settlement, error) {
	var settlements []*Settlement
	err := DB.Order("id desc").Find(&settlements).Error
	return settlements, err
}

// SettlementLoop 后台周期结算任务。
func SettlementLoop(frequencySeconds int) {
	if frequencySeconds <= 0 {
		frequencySeconds = SettlementPeriodDay
	}
	for {
		now := time.Now()
		// 结算上一完整周期 [start, now)
		start := now.Unix() - int64(frequencySeconds)
		_, err := GenerateSettlement(start, now.Unix())
		if err != nil {
			log.Printf("settlement error: %v", err)
		}
		time.Sleep(time.Duration(frequencySeconds) * time.Second)
	}
}

// ConfirmSettlement 确认结算：settling_balance 转入 withdraw_balance。
func ConfirmSettlement(id int) error {
	var settlement Settlement
	if err := DB.First(&settlement, "id = ?", id).Error; err != nil {
		return err
	}
	if settlement.Status != SettlementStatusPending {
		return nil // 已处理
	}
	var supplier Supplier
	if err := DB.First(&supplier, "id = ?", settlement.SupplierId).Error; err != nil {
		return err
	}
	// 结算中余额扣减 + 可提现余额增加
	tx := DB.Begin()
	if err := tx.Model(&Supplier{}).Where("id = ?", settlement.SupplierId).
		Update("settling_balance", gorm.Expr("settling_balance - ?", settlement.RevenueQuota)).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Model(&Supplier{}).Where("id = ?", settlement.SupplierId).
		Update("withdraw_balance", gorm.Expr("withdraw_balance + ?", settlement.RevenueQuota)).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Model(&Settlement{}).Where("id = ?", id).Update("status", SettlementStatusSettled).Error; err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}
