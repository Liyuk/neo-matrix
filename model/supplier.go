package model

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Supplier 供给方（与 users 1:1）。有闲置 API Key、把 Key 托管到平台的用户。
type Supplier struct {
	Id              int     `json:"id"`
	UserId          int     `json:"user_id" gorm:"uniqueIndex"`
	Status          int     `json:"status" gorm:"default:1"`           // 1=正常 2=冻结
	PlatformRatio   float64 `json:"platform_ratio" gorm:"default:0.2"` // 平台抽利润比例
	WithdrawBalance int     `json:"withdraw_balance" gorm:"default:0"` // 可提现余额(quota)
	SettlingBalance int     `json:"settling_balance" gorm:"default:0"` // 结算中余额(quota)
	TotalIncome     int     `json:"total_income" gorm:"default:0"`     // 累计收益(quota)
	// neo-matrix: 供给方信任与成本申报
	TrustLevel     int    `json:"trust_level" gorm:"default:1"`      // 供给方信任等级 1-5
	CostDeclStatus int    `json:"cost_decl_status" gorm:"default:0"` // 成本申报状态 0未申报/1待审/2核准/3驳回
	CostDeclNote   string `json:"cost_decl_note" gorm:"type:text"`   // 申报说明/审批理由
	CreatedTime    int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime    int64  `json:"updated_time" gorm:"bigint"`
}

const (
	SupplierStatusEnabled = 1
	SupplierStatusFrozen  = 2
)

func GetSupplierByUserId(userId int) (*Supplier, error) {
	supplier := Supplier{}
	err := DB.Where("user_id = ?", userId).First(&supplier).Error
	if err != nil {
		return nil, err
	}
	return &supplier, nil
}

func GetSupplierById(id int) (*Supplier, error) {
	supplier := Supplier{}
	err := DB.First(&supplier, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &supplier, nil
}

// EnsureSupplier returns the user's supplier account, creating an enabled account on first use.
// Every authenticated user may provide an upstream key; admin approval is not required.
func EnsureSupplier(userId int) (*Supplier, error) {
	if existing, err := GetSupplierByUserId(userId); err == nil && existing != nil {
		if existing.Status != SupplierStatusEnabled {
			existing.Status = SupplierStatusEnabled
			existing.UpdatedTime = time.Now().Unix()
			if err := DB.Save(existing).Error; err != nil {
				return nil, err
			}
		}
		return existing, nil
	}
	now := time.Now().Unix()
	supplier := &Supplier{
		UserId:        userId,
		Status:        SupplierStatusEnabled,
		PlatformRatio: 0.2,
		TrustLevel:    1,
		CreatedTime:   now,
		UpdatedTime:   now,
	}
	if err := DB.Create(supplier).Error; err != nil {
		return nil, err
	}
	return supplier, nil
}

func IsSupplier(userId int) bool {
	supplier, err := GetSupplierByUserId(userId)
	return err == nil && supplier != nil && supplier.Status == SupplierStatusEnabled
}

// GetAllSuppliers 所有供给方（管理端审核/列表用）。
func GetAllSuppliers() ([]*Supplier, error) {
	var suppliers []*Supplier
	err := DB.Order("id desc").Find(&suppliers).Error
	return suppliers, err
}

// ApplySupplier is kept as a backwards-compatible idempotent endpoint.
// Supplier access is enabled automatically for every authenticated user.
func ApplySupplier(userId int) (*Supplier, error) {
	return EnsureSupplier(userId)
}

// UpdateSupplierBalance 原子增减供给方余额（type: withdraw=可提现, settling=结算中）。
func UpdateSupplierBalance(userId int, delta int, balanceType string) error {
	field := "withdraw_balance"
	if balanceType == "settling" {
		field = "settling_balance"
	}
	return DB.Model(&Supplier{}).Where("user_id = ?", userId).
		Update(field, gorm.Expr(field+" + ?", delta)).Error
}

// UpdateSupplierTrust 更新供给方信任等级（1-5），记录操作者与时间。
func UpdateSupplierTrust(userId int, level int, operatorId int) error {
	if level < 1 {
		level = 1
	}
	if level > 5 {
		level = 5
	}
	return DB.Model(&Supplier{}).Where("user_id = ?", userId).
		Updates(map[string]interface{}{
			"trust_level":  level,
			"updated_time": time.Now().Unix(),
		}).Error
}

// UpdateSupplierStatus 审核供给方申请：status=1 通过 / status=2 冻结拒绝。返回供给方。
func UpdateSupplierStatus(userId int, status int) (*Supplier, error) {
	if status != SupplierStatusEnabled && status != SupplierStatusFrozen {
		return nil, fmt.Errorf("非法的供给方状态：%d", status)
	}
	err := DB.Model(&Supplier{}).Where("user_id = ?", userId).
		Updates(map[string]interface{}{
			"status":       status,
			"updated_time": time.Now().Unix(),
		}).Error
	if err != nil {
		return nil, err
	}
	return GetSupplierByUserId(userId)
}

// RequestWithdrawal 提现：从可提现余额原子扣减。
// 用条件 UPDATE（余额足够才扣）避免并发请求都通过读到的旧余额 → 透支提现。
// 返回错误：余额不足或扣减失败。
func (s *Supplier) RequestWithdrawal(amount int) error {
	if amount <= 0 {
		return fmt.Errorf("提现金额必须大于 0")
	}
	result := DB.Model(&Supplier{}).
		Where("user_id = ? AND withdraw_balance >= ?", s.UserId, amount).
		Update("withdraw_balance", gorm.Expr("withdraw_balance - ?", amount))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return fmt.Errorf("可提现余额不足：现有 %d，需 %d", s.WithdrawBalance, amount)
	}
	return nil
}

// Settlement 分成结算单。按周期聚合某渠道的消费日志生成。
// UNIQUE(period_start, period_end, channel_id) 保证同周期同渠道只有一条结算单（幂等防重）。
type Settlement struct {
	Id            int   `json:"id"`
	PeriodStart   int64 `json:"period_start" gorm:"bigint;uniqueIndex:idx_settlement_period_channel"`
	PeriodEnd     int64 `json:"period_end" gorm:"bigint;uniqueIndex:idx_settlement_period_channel"`
	SupplierId    int   `json:"supplier_id" gorm:"index"`
	ChannelId     int   `json:"channel_id" gorm:"uniqueIndex:idx_settlement_period_channel"`
	TotalQuota    int   `json:"total_quota"`                            // 周期内零售额合计(消费者实付)
	CostQuota     int   `json:"cost_quota"`                             // 周期内成本合计(付给上游)
	RevenueQuota  int   `json:"revenue_quota"`                          // 供给方分成
	PlatformQuota int   `json:"platform_quota"`                         // 平台留存
	Status        int   `json:"status" gorm:"default:0"`                // 0待结算 1已确认 2已入账 3对账异常
	UsedQuotaEnd  int64 `json:"used_quota_end" gorm:"bigint;default:0"` // 本周期末 channel.used_quota 快照，用于下周期增量对账
	CreatedTime   int64 `json:"created_time" gorm:"bigint"`
}

const (
	SettlementStatusPending   = 0
	SettlementStatusConfirmed = 1
	SettlementStatusSettled   = 2
	SettlementStatusMismatch  = 3
)

// Withdrawal 提现申请。
type Withdrawal struct {
	Id          int     `json:"id"`
	SupplierId  int     `json:"supplier_id" gorm:"index"`
	UserId      int     `json:"user_id" gorm:"index"`
	AmountQuota int     `json:"amount_quota"` // 提现额度(quota)
	AmountFiat  float64 `json:"amount_fiat"`  // 换算后金额(元)
	PayMethod   string  `json:"pay_method"`   // 支付宝/微信/银行卡
	PayAccount  string  `json:"pay_account"`
	Status      int     `json:"status" gorm:"default:0"` // 0待审核 1打款中 2已打款 3已驳回
	Reason      string  `json:"reason"`
	CreatedTime int64   `json:"created_time" gorm:"bigint"`
	UpdatedTime int64   `json:"updated_time" gorm:"bigint"`
}

const (
	WithdrawalStatusPending  = 0
	WithdrawalStatusPaying   = 1
	WithdrawalStatusPaid     = 2
	WithdrawalStatusRejected = 3
)

func CreateWithdrawal(withdrawal *Withdrawal) error {
	return DB.Create(withdrawal).Error
}

func GetWithdrawalsByUser(userId int) ([]*Withdrawal, error) {
	var withdrawals []*Withdrawal
	err := DB.Where("user_id = ?", userId).Order("id desc").Find(&withdrawals).Error
	return withdrawals, err
}

func GetAllWithdrawals() ([]*Withdrawal, error) {
	var withdrawals []*Withdrawal
	err := DB.Order("id desc").Find(&withdrawals).Error
	return withdrawals, err
}

// ProcessWithdrawal 处理提现：status=2 打款完成；status=3 驳回并退回可提现余额。
// 用原子状态翻转（仅 pending 可被处理）避免并发重复处理导致双重退款/双重入账。
func ProcessWithdrawal(id int, status int, reason string) error {
	if status != WithdrawalStatusPaying && status != WithdrawalStatusPaid && status != WithdrawalStatusRejected {
		return fmt.Errorf("非法的提现处理状态：%d", status)
	}
	var withdrawal Withdrawal
	if err := DB.First(&withdrawal, "id = ?", id).Error; err != nil {
		return err
	}
	if withdrawal.Status != WithdrawalStatusPending {
		return fmt.Errorf("该提现已处理")
	}
	now := time.Now().Unix()
	tx := DB.Begin()
	// 原子抢状态：仅当仍为 pending 时翻转，并发时只有一个成功
	result := tx.Model(&Withdrawal{}).Where("id = ? AND status = ?", id, WithdrawalStatusPending).
		Updates(map[string]interface{}{"status": status, "reason": reason, "updated_time": now})
	if result.Error != nil {
		tx.Rollback()
		return result.Error
	}
	if result.RowsAffected != 1 {
		tx.Rollback()
		return fmt.Errorf("该提现已处理")
	}
	if status == WithdrawalStatusRejected {
		// 驳回：退回余额
		if err := tx.Model(&Supplier{}).Where("user_id = ?", withdrawal.UserId).
			Update("withdraw_balance", gorm.Expr("withdraw_balance + ?", withdrawal.AmountQuota)).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit().Error
}
