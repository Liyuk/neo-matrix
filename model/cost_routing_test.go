package model

import (
	"testing"

	"github.com/neo-matrix/neo-matrix/common/config"
)

func TestChannelEffectiveCost(t *testing.T) {
	tests := []struct {
		name         string
		channel      *Channel
		model        string
		expectedCost float64
	}{
		{
			name:         "default cost ratio 1.0",
			channel:      &Channel{CostRatio: 1.0},
			model:        "gpt-4o",
			expectedCost: 1.0,
		},
		{
			name:         "custom cost ratio",
			channel:      &Channel{CostRatio: 0.5},
			model:        "gpt-4o",
			expectedCost: 0.5,
		},
		{
			name: "per-model cost overrides global",
			channel: &Channel{
				CostRatio:      0.5,
				ModelCostRatio: `{"gpt-4o-mini":0.1}`,
			},
			model:        "gpt-4o-mini",
			expectedCost: 0.1,
		},
		{
			name: "per-model cost misses, fallback to global",
			channel: &Channel{
				CostRatio:      0.5,
				ModelCostRatio: `{"gpt-4o-mini":0.1}`,
			},
			model:        "gpt-4o",
			expectedCost: 0.5,
		},
		{
			name:         "zero cost ratio falls back to 1.0",
			channel:      &Channel{CostRatio: 0},
			model:        "gpt-4o",
			expectedCost: 1.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.channel.EffectiveCost(tt.model)
			if got != tt.expectedCost {
				t.Errorf("EffectiveCost() = %v, want %v", got, tt.expectedCost)
			}
		})
	}
}

func TestRoutingCostTrustPenalty(t *testing.T) {
	// 显式控制配置，避免受环境变量干扰
	oldLv1, oldLv2 := config.TrustPenaltyLv1, config.TrustPenaltyLv2
	config.TrustPenaltyLv1 = 5.0
	config.TrustPenaltyLv2 = 3.0
	defer func() { config.TrustPenaltyLv1, config.TrustPenaltyLv2 = oldLv1, oldLv2 }()

	base := &Channel{CostRatio: 1.0}
	lowTrust := &Channel{CostRatio: 1.0, TrustLevel: 1}
	midTrust := &Channel{CostRatio: 1.0, TrustLevel: 2}
	highTrust := &Channel{CostRatio: 1.0, TrustLevel: 3}
	// 有效成本与信任无关（结算口径）
	if base.EffectiveCost("gpt-4o") != 1.0 || lowTrust.EffectiveCost("gpt-4o") != 1.0 {
		t.Errorf("EffectiveCost must not include trust penalty (settlement uses it)")
	}
	// 路由成本含信任惩罚（默认：信任1 → ×5，信任2 → ×3）
	if lowTrust.RoutingCost("gpt-4o") != 5.0 {
		t.Errorf("trust=1 routing cost = %v, want 5.0", lowTrust.RoutingCost("gpt-4o"))
	}
	if midTrust.RoutingCost("gpt-4o") != 3.0 {
		t.Errorf("trust=2 routing cost = %v, want 3.0", midTrust.RoutingCost("gpt-4o"))
	}
	if highTrust.RoutingCost("gpt-4o") != 1.0 {
		t.Errorf("trust>=3 routing cost = %v, want 1.0", highTrust.RoutingCost("gpt-4o"))
	}
	// 信任越高，加权分值越高（选中概率越大）
	if !(highTrust.WeightFactor("gpt-4o") > lowTrust.WeightFactor("gpt-4o")) {
		t.Errorf("high trust should have higher weight factor")
	}
	// 配置可调：调低惩罚力度后，低信任选中概率应更高
	config.TrustPenaltyLv1 = 1.5
	config.TrustPenaltyLv2 = 1.2
	if lowTrust.WeightFactor("gpt-4o") >= highTrust.WeightFactor("gpt-4o") {
		t.Errorf("with relaxed penalty, low trust should still be less likely but closer")
	}
}

func TestCacheGetCheapestChannel(t *testing.T) {
	// 模拟已排序的渠道列表：优先级降序 + 成本升序（同成本，信任不同）
	// 三个渠道成本相同 → 信任惩罚生效：trust=1 概率最低
	lowTrust := &Channel{Id: 1, Priority: intPtr(10), CostRatio: 0.5, TrustLevel: 1}
	midTrust := &Channel{Id: 2, Priority: intPtr(10), CostRatio: 0.5, TrustLevel: 2}
	highTrust := &Channel{Id: 3, Priority: intPtr(10), CostRatio: 0.5, TrustLevel: 3}

	channels := []*Channel{lowTrust, midTrust, highTrust}

	// 正常选路：top tier 内加权随机，统计选中率——高信任应显著更可能被选中，低信任非零
	total := 3000
	counts := map[int]int{}
	for i := 0; i < total; i++ {
		got, err := pickCheapestInTopTier(channels, "gpt-4o", false, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		counts[got.Id]++
	}
	if counts[3] <= counts[1] {
		t.Errorf("high trust (id=3) should be picked more than low trust (id=1): %v", counts)
	}
	if counts[1] == 0 {
		t.Errorf("low trust (id=1) should occasionally be picked (non-zero, for ramp-up): %v", counts)
	}

	// 全等权重（成本相同、信任相同）→ 仍有随机平摊，但应分布均匀（不总是同一条）
	same := []*Channel{
		{Id: 1, Priority: intPtr(10), CostRatio: 0.5, TrustLevel: 3},
		{Id: 2, Priority: intPtr(10), CostRatio: 0.5, TrustLevel: 3},
	}
	sameCounts := map[int]int{}
	for i := 0; i < 500; i++ {
		got, err := pickCheapestInTopTier(same, "gpt-4o", false, 0)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		sameCounts[got.Id]++
	}
	if sameCounts[1] == 0 || sameCounts[2] == 0 {
		t.Errorf("equal weights should spread across channels, got %v", sameCounts)
	}

	// 重试：跳过 top tier，选低优先级
	lowPriority := &Channel{Id: 9, Priority: intPtr(5), CostRatio: 0.1}
	channels2 := []*Channel{lowTrust, midTrust, highTrust, lowPriority}
	got, err := pickCheapestInTopTier(channels2, "gpt-4o", true, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Id != 9 {
		t.Errorf("expected low priority channel (id=9), got id=%d", got.Id)
	}
}

func TestArbitrageExcludeOwner(t *testing.T) {
	// 供给方自营渠道 vs 平台渠道：排除 owner 后不该再选中自营渠道
	selfOwned := &Channel{Id: 1, Priority: intPtr(10), CostRatio: 0.1, TrustLevel: 5, OwnerId: 42}
	platform := &Channel{Id: 2, Priority: intPtr(10), CostRatio: 1.0, TrustLevel: 5, OwnerId: 0}
	channels := []*Channel{selfOwned, platform}

	// excludeOwnerId=42：自营渠道被排除，应总选中平台渠道
	for i := 0; i < 200; i++ {
		got, err := pickCheapestInTopTier(channels, "gpt-4o", false, 42)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Id == 1 {
			t.Fatalf("self-owned channel must be excluded for owner 42, got id=1")
		}
	}

	// excludeOwnerId=0（平台消费者）：不排除任何
	got, err := pickCheapestInTopTier(channels, "gpt-4o", false, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got == nil {
		t.Fatalf("nil channel")
	}
}

func intPtr(v int64) *int64 {
	return &v
}
