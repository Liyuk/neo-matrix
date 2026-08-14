package model

import (
	"os"
	"testing"

	"github.com/neo-matrix/neo-matrix/common"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// TestMain 在跑任何 model 包测试前，用共享内存 SQLite 初始化 DB / LOG_DB 并建表。
// 纯函数测试（settlement_test / cost_routing_test）不依赖 DB，照常执行。
func TestMain(m *testing.M) {
	common.UsingSQLite = true
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		panic(err)
	}
	sqlDB, _ := db.DB()
	// 单连接：内存库按连接隔离，多连接会导致数据互相不可见
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&Channel{}, &Supplier{}, &Settlement{}, &Withdrawal{}, &Ability{}, &User{}, &Token{}); err != nil {
		panic(err)
	}
	DB = db
	LOG_DB = db
	if err := LOG_DB.AutoMigrate(&Log{}); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

// resetSettlementTables 清空测试数据，保证各用例隔离。
func resetSettlementTables() {
	DB.Exec("DELETE FROM settlements")
	DB.Exec("DELETE FROM suppliers")
	DB.Exec("DELETE FROM channels")
	LOG_DB.Exec("DELETE FROM logs")
}

func TestGenerateSettlementCreateAndRerun(t *testing.T) {
	resetSettlementTables()
	supplier := Supplier{UserId: 42, PlatformRatio: 0.2}
	if err := DB.Create(&supplier).Error; err != nil {
		t.Fatalf("create supplier: %v", err)
	}
	channel := Channel{Type: 1, Name: "c", OwnerId: 42, SettleEnabled: 1, Status: ChannelStatusEnabled, UsedQuota: 1000}
	if err := DB.Create(&channel).Error; err != nil {
		t.Fatalf("create channel: %v", err)
	}
	// 周期 [1000,2000) 消费：total=1000, cost=800 → profit=200, revenue=800+160=960, platform=40
	LOG_DB.Create(&Log{UserId: 1, Type: LogTypeConsume, ChannelId: channel.Id, Quota: 1000, CostQuota: 800, CreatedAt: 1500})

	count, err := GenerateSettlement(1000, 2000)
	if err != nil {
		t.Fatalf("first settlement: %v", err)
	}
	if count != 1 {
		t.Fatalf("first settlement count = %d, want 1", count)
	}
	var s Settlement
	if err := DB.First(&s, "channel_id = ?", channel.Id).Error; err != nil {
		t.Fatalf("load settlement: %v", err)
	}
	if s.TotalQuota != 1000 || s.CostQuota != 800 || s.RevenueQuota != 960 || s.PlatformQuota != 40 {
		t.Fatalf("settlement values wrong: total=%d cost=%d rev=%d plat=%d, want 1000/800/960/40",
			s.TotalQuota, s.CostQuota, s.RevenueQuota, s.PlatformQuota)
	}
	var sup Supplier
	if err := DB.First(&sup, "user_id = ?", 42).Error; err != nil {
		t.Fatalf("load supplier: %v", err)
	}
	if sup.SettlingBalance != 960 {
		t.Fatalf("settling_balance after create = %d, want 960", sup.SettlingBalance)
	}

	// 幂等重跑（数据未变）→ 不重复入账、余额不变
	if _, err := GenerateSettlement(1000, 2000); err != nil {
		t.Fatalf("idempotent rerun: %v", err)
	}
	DB.First(&sup, "user_id = ?", 42)
	if sup.SettlingBalance != 960 {
		t.Fatalf("settling_balance after idempotent rerun = %d, want 960", sup.SettlingBalance)
	}

	// 补录日志后重跑 → 聚合值更新 + 余额补差额（新 revenue=1440, delta=480）
	LOG_DB.Create(&Log{UserId: 1, Type: LogTypeConsume, ChannelId: channel.Id, Quota: 500, CostQuota: 400, CreatedAt: 1800})
	if _, err := GenerateSettlement(1000, 2000); err != nil {
		t.Fatalf("rerun after backfill: %v", err)
	}
	DB.First(&s, "channel_id = ?", channel.Id)
	if s.RevenueQuota != 1440 {
		t.Fatalf("revenue after backfill = %d, want 1440", s.RevenueQuota)
	}
	DB.First(&sup, "user_id = ?", 42)
	if sup.SettlingBalance != 960+480 {
		t.Fatalf("settling_balance after backfill = %d, want %d", sup.SettlingBalance, 960+480)
	}
	// 重跑不污染对账基准：used_quota_end 保持首次快照（1000）
	if s.UsedQuotaEnd != 1000 {
		t.Fatalf("used_quota_end after rerun = %d, want 1000 (must not be overwritten by current value)", s.UsedQuotaEnd)
	}
}

func TestGenerateSettlementSkipSettled(t *testing.T) {
	resetSettlementTables()
	supplier := Supplier{UserId: 7, PlatformRatio: 0.2}
	DB.Create(&supplier)
	channel := Channel{Type: 1, Name: "c", OwnerId: 7, SettleEnabled: 1, Status: ChannelStatusEnabled, UsedQuota: 100}
	DB.Create(&channel)
	LOG_DB.Create(&Log{UserId: 1, Type: LogTypeConsume, ChannelId: channel.Id, Quota: 100, CostQuota: 80, CreatedAt: 1500})

	if _, err := GenerateSettlement(1000, 2000); err != nil {
		t.Fatalf("create: %v", err)
	}
	var s Settlement
	DB.First(&s, "channel_id = ?", channel.Id)
	if err := ConfirmSettlement(s.Id); err != nil {
		t.Fatalf("confirm: %v", err)
	}
	var sup Supplier
	DB.First(&sup, "user_id = ?", 7)
	if sup.WithdrawBalance == 0 {
		t.Fatalf("withdraw_balance not credited after confirm")
	}
	// 补录日志后重跑 → 已入账单不可被覆盖
	LOG_DB.Create(&Log{UserId: 1, Type: LogTypeConsume, ChannelId: channel.Id, Quota: 500, CostQuota: 400, CreatedAt: 1800})
	if _, err := GenerateSettlement(1000, 2000); err != nil {
		t.Fatalf("rerun after settled: %v", err)
	}
	var s2 Settlement
	DB.First(&s2, "channel_id = ?", channel.Id)
	if s2.TotalQuota != 100 || s2.Status != SettlementStatusSettled {
		t.Fatalf("settled settlement was modified: total=%d status=%d", s2.TotalQuota, s2.Status)
	}
	DB.First(&sup, "user_id = ?", 7)
	if sup.SettlingBalance != 0 {
		t.Fatalf("settling_balance changed after settled rerun = %d, want 0", sup.SettlingBalance)
	}
}

func TestConfirmSettlementAcceptsMismatch(t *testing.T) {
	resetSettlementTables()
	supplier := Supplier{UserId: 9, PlatformRatio: 0.2}
	DB.Create(&supplier)
	settlement := Settlement{
		PeriodStart: 1000, PeriodEnd: 2000, SupplierId: supplier.Id, ChannelId: 99,
		TotalQuota: 1000, CostQuota: 800, RevenueQuota: 960, PlatformQuota: 40,
		Status: SettlementStatusMismatch, // 对账异常，管理员核验后入账
	}
	DB.Create(&settlement)

	if err := ConfirmSettlement(settlement.Id); err != nil {
		t.Fatalf("confirm mismatch settlement: %v", err)
	}
	var s Settlement
	DB.First(&s, "id = ?", settlement.Id)
	if s.Status != SettlementStatusSettled {
		t.Fatalf("mismatch settlement not settled: status=%d", s.Status)
	}
	// 结算中余额扣减 + 可提现余额增加（settling 假定已在 create 时入账 960）
	var sup Supplier
	DB.First(&sup, "id = ?", supplier.Id)
	if sup.SettlingBalance != -960 || sup.WithdrawBalance != 960 {
		t.Fatalf("balance move wrong: settling=%d withdraw=%d, want -960/960", sup.SettlingBalance, sup.WithdrawBalance)
	}
	// 重复确认不重复入账
	if err := ConfirmSettlement(settlement.Id); err != nil {
		t.Fatalf("re-confirm: %v", err)
	}
	DB.First(&sup, "id = ?", supplier.Id)
	if sup.WithdrawBalance != 960 {
		t.Fatalf("double-credit on re-confirm: withdraw=%d, want 960", sup.WithdrawBalance)
	}
}
