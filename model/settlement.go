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

// settlementReconcileThresholdRatio 对账偏差阈值比例：used_quota 增量与日志总量偏差超过
// 该比例×日志量即判异常。容忍 cost_quota 图片/音频口径差异与批量更新滞后。
const settlementReconcileThresholdRatio = 0.2

// settlementTrustDegradeAfter 连续对账异常达到该次数时降低渠道信任等级。
const settlementTrustDegradeAfter = 2

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

		// 对账：本周期内 channel.used_quota 增量 vs 本周期消费日志总量。
		// 用上一周期结算快照 used_quota_end 求增量（used_quota 是累计值，不能直接比）。
		mismatch := reconcileChannelUsage(item.ChannelId, channel.UsedQuota, periodStart, periodEnd)

		// 幂等检查：同周期同渠道已存在则更新
		var existing Settlement
		err = DB.Where("period_start = ? AND period_end = ? AND channel_id = ?", periodStart, periodEnd, item.ChannelId).First(&existing).Error
		// 重叠防重：若该渠道已有"周期边界不同但时间上重叠"的结算单，跳过本单，
		// 防止同一批日志被重叠周期重复结算/重复入账。
		if err != nil {
			var overlapping int64
			DB.Model(&Settlement{}).
				Where("channel_id = ? AND period_start < ? AND period_end > ?", item.ChannelId, periodEnd, periodStart).
				Count(&overlapping)
			if overlapping > 0 {
				log.Printf("settlement: skip channel %d period [%d,%d) - overlaps existing settlement", item.ChannelId, periodStart, periodEnd)
				continue
			}
		}
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
			UsedQuotaEnd:  channel.UsedQuota,
			CreatedTime:   time.Now().Unix(),
		}
		if mismatch {
			settlement.Status = SettlementStatusMismatch
		}
		if err == nil {
			// 已存在：若已确认/已入账则跳过，否则更新为最新聚合值
			if existing.Status >= SettlementStatusConfirmed {
				continue
			}
			// 新判为异常，且此前不是异常 → 触发降权（重跑已异常记录不重复降权）
			if mismatch && existing.Status != SettlementStatusMismatch {
				degradeChannelTrust(item.ChannelId, periodEnd)
			}
			settlement.Id = existing.Id
			updates := map[string]interface{}{
				"total_quota":    item.TotalQuota,
				"cost_quota":     item.CostQuota,
				"revenue_quota":  revenueQuota,
				"platform_quota": platformQuota,
				"used_quota_end": channel.UsedQuota,
				"status":         SettlementStatusPending,
				"created_time":   time.Now().Unix(),
			}
			if mismatch {
				updates["status"] = SettlementStatusMismatch
			}
			if err := DB.Model(&Settlement{}).Where("id = ?", existing.Id).Updates(updates).Error; err != nil {
				return count, err
			}
			count++
			continue
		}
		if err := DB.Create(&settlement).Error; err != nil {
			return count, err
		}
		// 新创建且判为异常 → 触发降权（幂等：create 只发生一次，重跑走 update 分支不再降）
		if mismatch {
			degradeChannelTrust(item.ChannelId, periodEnd)
		}
		// 计入结算中余额（对账异常时仍计入，由管理员人工处置/对账降权触发）。
		// 放入事务：settlement 创建 + 余额入账 原子，失败整体回滚，避免"结算单存在但钱没到账"。
		tx := DB.Begin()
		if err := tx.Model(&Supplier{}).Where("user_id = ?", supplier.UserId).
			Update("settling_balance", gorm.Expr("settling_balance + ?", revenueQuota)).Error; err != nil {
			tx.Rollback()
			// 回滚结算单，让重跑能重新入账
			_ = DB.Delete(&Settlement{}, "id = ?", settlement.Id)
			return count, err
		}
		if err := tx.Commit().Error; err != nil {
			tx.Rollback()
			_ = DB.Delete(&Settlement{}, "id = ?", settlement.Id)
			return count, err
		}
		count++
	}
	return count, nil
}

// reconcileChannelUsage 对账：本周期内某渠道实际消费（logs 聚合）与 used_quota 增量是否一致。
// 判定：从上一周期该渠道的结算快照 used_quota_end 出发，计算 used_quota 增量，
// 与周期内日志 SUM(quota) 比对，偏差超过阈值（settlementReconcileThresholdRatio × 日志量）判为异常。
// 无上一周期快照（首次结算）时不做对账（无法取增量基准）。
func reconcileChannelUsage(channelId int, currentUsedQuota int64, periodStart int64, periodEnd int64) bool {
	// 上一周期结算单（取最近一条已存在的时间上早于本周期的）
	var prev Settlement
	err := DB.Where("channel_id = ? AND period_end <= ?", channelId, periodStart).
		Order("period_end desc").First(&prev).Error
	if err != nil || prev.Id == 0 || prev.UsedQuotaEnd == 0 {
		return false // 无基准，不对账
	}
	delta := currentUsedQuota - prev.UsedQuotaEnd
	if delta < 0 {
		// used_quota 倒退异常（如渠道重置），直接判异常
		return true
	}
	// 本周期日志总量（re-query，聚合在 items 里没带过来）
	var totalLogQuota int64
	LOG_DB.Table("logs").
		Select("COALESCE(SUM(quota),0)").
		Where("channel_id = ? AND type = ? AND created_at >= ? AND created_at < ?", channelId, LogTypeConsume, periodStart, periodEnd).
		Scan(&totalLogQuota)
	// 口径容忍：cost_quota 仅文本请求准确，但 used_quota 增量为全口径（含图片/音频）。
	// 用比例阈值：偏差超过日志量的 20% 判异常，避免批量更新滞后导致的误判。
	threshold := int64(float64(totalLogQuota) * settlementReconcileThresholdRatio)
	if threshold < 100 {
		threshold = 100 // 最小绝对阈值，防极小量时误判
	}
	diff := delta - totalLogQuota
	if diff < 0 {
		diff = -diff
	}
	return diff > threshold
}

// degradeChannelTrust 对账异常时降低渠道信任等级（只降不升）。
// 连续 settlementTrustDegradeAfter 个周期异常才降一次，防止偶发口径差异误降。
// 降权后渠道在路由加权随机里的选中概率降低；连续异常累计到阈值会一路降到 1。
func degradeChannelTrust(channelId int, periodEnd int64) {
	// 统计之前的异常周期数（当前这条尚未落库，+1 计入）。达到阈值才降一次权。
	var prevCount int64
	DB.Model(&Settlement{}).
		Where("channel_id = ? AND status = ? AND period_end < ?", channelId, SettlementStatusMismatch, periodEnd).
		Count(&prevCount)
	if prevCount+1 < settlementTrustDegradeAfter {
		return
	}
	// 降 TrustLevel（最低 1）。降到 1 后不再更低。
	err := DB.Model(&Channel{}).Where("id = ?", channelId).
		Update("trust_level", gorm.Expr("MAX(trust_level - 1, 1)")).Error
	if err != nil {
		log.Printf("settlement: failed to degrade trust for channel %d: %v", channelId, err)
		return
	}
	// 刷新路由缓存，让降权即时生效
	InitChannelCache()
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
// 按"上次结束点"推进窗口，保证连续覆盖不重不漏：
// - 正常：每 frequencySeconds 结算 [lastEnd, lastEnd+frequency)。
// - 漂移/暂停：若上次执行耗时或进程暂停，窗口仍从 lastEnd 起，不产生 gap；
//   若落后超过一个周期，一次性追平到当前时间（backfill），避免日志永不结算。
func SettlementLoop(frequencySeconds int) {
	if frequencySeconds <= 0 {
		frequencySeconds = SettlementPeriodDay
	}
	var lastEnd int64
	first := true
	for {
		now := time.Now().Unix()
		if first {
			// 首次启动：结算启动前最近一个完整周期 [now-freq, now)
			lastEnd = now - int64(frequencySeconds)
			first = false
		}
		// 落后则一次追平到 now（backfill 多个缺口），不重不漏
		for lastEnd < now {
			end := lastEnd + int64(frequencySeconds)
			if end > now {
				end = now
			}
			_, err := GenerateSettlement(lastEnd, end)
			if err != nil {
				log.Printf("settlement error: %v", err)
			}
			lastEnd = end
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
	tx := DB.Begin()
	// 原子抢状态：仅当仍为 pending 时翻转，并发双击只有一个成功
	result := tx.Model(&Settlement{}).Where("id = ? AND status = ?", id, SettlementStatusPending).
		Update("status", SettlementStatusSettled)
	if result.Error != nil {
		tx.Rollback()
		return result.Error
	}
	if result.RowsAffected != 1 {
		tx.Rollback()
		return nil // 已被其他请求处理
	}
	// 结算中余额扣减 + 可提现余额增加（状态已锁定，余额转移同事务）
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
	return tx.Commit().Error
}
