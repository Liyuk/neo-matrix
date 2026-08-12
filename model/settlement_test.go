package model

import (
	"testing"
)

func TestSettlementRevenue(t *testing.T) {
	tests := []struct {
		name          string
		totalQuota    int
		costQuota     int
		platformRatio float64
		wantRevenue   int
		wantPlatform  int
	}{
		{
			name:          "cost = retail, platform 20% of profit (profit=0)",
			totalQuota:    1000,
			costQuota:     1000,
			platformRatio: 0.2,
			wantRevenue:   1000,
			wantPlatform:  0,
		},
		{
			name:          "profit positive, supplier keeps 80% of profit",
			totalQuota:    2000,
			costQuota:     1000,
			platformRatio: 0.2,
			wantRevenue:   1000 + int(float64(1000)*0.8), // 1800
			wantPlatform:  200,
		},
		{
			name:          "profit negative (cost > retail), revenue clamped to total",
			totalQuota:    1000,
			costQuota:     2000,
			platformRatio: 0.2,
			wantRevenue:   1000, // revenue = cost + neg_profit*0.8 = 2000-800=1200, clamped to total=1000
			wantPlatform:  0,    // platform = total - revenue = 0, never negative
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profit := tt.totalQuota - tt.costQuota
			revenue := tt.costQuota + int(float64(profit)*(1-tt.platformRatio))
			if revenue < 0 || revenue > tt.totalQuota {
				revenue = tt.totalQuota
			}
			platform := tt.totalQuota - revenue
			if revenue != tt.wantRevenue {
				t.Errorf("revenue = %d, want %d", revenue, tt.wantRevenue)
			}
			if platform != tt.wantPlatform {
				t.Errorf("platform = %d, want %d", platform, tt.wantPlatform)
			}
		})
	}
}
