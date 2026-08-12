package model

import (
	"testing"
)

func TestChannelEffectiveCost(t *testing.T) {
	tests := []struct {
		name          string
		channel       *Channel
		model         string
		expectedCost  float64
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
			name: "zero cost ratio falls back to 1.0",
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

func TestCacheGetCheapestChannel(t *testing.T) {
	// 模拟已排序的渠道列表：优先级降序 + 成本升序
	cheap := &Channel{Id: 1, Priority: intPtr(10), CostRatio: 0.5}
	normal := &Channel{Id: 2, Priority: intPtr(10), CostRatio: 1.0}
	lowPriority := &Channel{Id: 3, Priority: intPtr(5), CostRatio: 0.1}

	channels := []*Channel{cheap, normal, lowPriority}

	// 正常选路：top tier (priority=10) 内选成本最低 → cheap
	got, err := pickCheapestInTopTier(channels, "gpt-4o", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Id != 1 {
		t.Errorf("expected cheapest channel (id=1), got id=%d", got.Id)
	}

	// 重试：跳过 top tier，选低优先级
	got, err = pickCheapestInTopTier(channels, "gpt-4o", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Id != 3 {
		t.Errorf("expected low priority channel (id=3), got id=%d", got.Id)
	}
}

func intPtr(v int64) *int64 {
	return &v
}
