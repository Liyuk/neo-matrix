package billing

import (
	"context"
	"fmt"

	"github.com/neo-matrix/neo-matrix/common/logger"
	"github.com/neo-matrix/neo-matrix/model"
)

func ReturnPreConsumedQuota(ctx context.Context, preConsumedQuota int64, tokenId int) {
	if preConsumedQuota != 0 {
		go func(ctx context.Context) {
			// return pre-consumed quota
			err := model.PostConsumeTokenQuota(tokenId, -preConsumedQuota)
			if err != nil {
				logger.Error(ctx, "error return pre-consumed quota: "+err.Error())
			}
		}(ctx)
	}
}

func PostConsumeQuota(ctx context.Context, tokenId int, quotaDelta int64, totalQuota int64, userId int, channelId int, modelRatio float64, groupRatio float64, modelName string, tokenName string) {
	// quotaDelta is remaining quota to be consumed
	err := model.PostConsumeTokenQuota(tokenId, quotaDelta)
	if err != nil {
		logger.SysError("error consuming token remain quota: " + err.Error())
	}
	err = model.CacheUpdateUserQuota(ctx, userId)
	if err != nil {
		logger.SysError("error update user quota cache: " + err.Error())
	}
	// totalQuota is total quota consumed
	if totalQuota != 0 {
		logContent := fmt.Sprintf("倍率：%.2f × %.2f", modelRatio, groupRatio)
		// neo-matrix: 非文本请求成本价 = 零售 quota × 渠道成本倍率（供分成结算）
		costQuota := computeRelayCostQuota(channelId, modelName, totalQuota)
		model.RecordConsumeLog(ctx, &model.Log{
			UserId:           userId,
			ChannelId:        channelId,
			PromptTokens:     int(totalQuota),
			CompletionTokens: 0,
			ModelName:        modelName,
			TokenName:        tokenName,
			Quota:            int(totalQuota),
			CostQuota:        costQuota,
			Content:          logContent,
		})
		model.UpdateUserUsedQuotaAndRequestCount(userId, totalQuota)
		model.UpdateChannelUsedQuota(channelId, totalQuota)
	}
	if totalQuota <= 0 {
		logger.Error(ctx, fmt.Sprintf("totalQuota consumed is %d, something is wrong", totalQuota))
	}
}

// computeRelayCostQuota 非文本请求成本价 = 零售 quota × 渠道成本倍率。
// billing 包避免 import relay/controller 循环依赖，独立实现（逻辑与 helper.go computeNonTextCostQuota 一致）。
func computeRelayCostQuota(channelId int, modelName string, retailQuota int64) int {
	if channelId == 0 {
		return 0
	}
	channel, err := model.GetChannelById(channelId, false)
	if err != nil || channel == nil {
		channel = &model.Channel{}
	}
	return int(float64(retailQuota) * channel.EffectiveCost(modelName))
}
