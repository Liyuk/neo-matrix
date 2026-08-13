package model

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/neo-matrix/neo-matrix/common"
	"github.com/neo-matrix/neo-matrix/common/config"
	"github.com/neo-matrix/neo-matrix/common/logger"
	"github.com/neo-matrix/neo-matrix/common/random"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	TokenCacheSeconds         = config.SyncFrequency
	UserId2GroupCacheSeconds  = config.SyncFrequency
	UserId2QuotaCacheSeconds  = config.SyncFrequency
	UserId2StatusCacheSeconds = config.SyncFrequency
	GroupModelsCacheSeconds   = config.SyncFrequency
)

func CacheGetTokenByKey(key string) (*Token, error) {
	keyCol := "`key`"
	if common.UsingPostgreSQL {
		keyCol = `"key"`
	}
	var token Token
	if !common.RedisEnabled {
		err := DB.Where(keyCol+" = ?", key).First(&token).Error
		return &token, err
	}
	tokenObjectString, err := common.RedisGet(fmt.Sprintf("token:%s", key))
	if err != nil {
		err := DB.Where(keyCol+" = ?", key).First(&token).Error
		if err != nil {
			return nil, err
		}
		jsonBytes, err := json.Marshal(token)
		if err != nil {
			return nil, err
		}
		err = common.RedisSet(fmt.Sprintf("token:%s", key), string(jsonBytes), time.Duration(TokenCacheSeconds)*time.Second)
		if err != nil {
			logger.SysError("Redis set token error: " + err.Error())
		}
		return &token, nil
	}
	err = json.Unmarshal([]byte(tokenObjectString), &token)
	return &token, err
}

func CacheGetUserGroup(id int) (group string, err error) {
	if !common.RedisEnabled {
		return GetUserGroup(id)
	}
	group, err = common.RedisGet(fmt.Sprintf("user_group:%d", id))
	if err != nil {
		group, err = GetUserGroup(id)
		if err != nil {
			return "", err
		}
		err = common.RedisSet(fmt.Sprintf("user_group:%d", id), group, time.Duration(UserId2GroupCacheSeconds)*time.Second)
		if err != nil {
			logger.SysError("Redis set user group error: " + err.Error())
		}
	}
	return group, err
}

func fetchAndUpdateUserQuota(ctx context.Context, id int) (quota int64, err error) {
	quota, err = GetUserQuota(id)
	if err != nil {
		return 0, err
	}
	err = common.RedisSet(fmt.Sprintf("user_quota:%d", id), fmt.Sprintf("%d", quota), time.Duration(UserId2QuotaCacheSeconds)*time.Second)
	if err != nil {
		logger.Error(ctx, "Redis set user quota error: "+err.Error())
	}
	return
}

func CacheGetUserQuota(ctx context.Context, id int) (quota int64, err error) {
	if !common.RedisEnabled {
		return GetUserQuota(id)
	}
	quotaString, err := common.RedisGet(fmt.Sprintf("user_quota:%d", id))
	if err != nil {
		return fetchAndUpdateUserQuota(ctx, id)
	}
	quota, err = strconv.ParseInt(quotaString, 10, 64)
	if err != nil {
		return 0, nil
	}
	if quota <= config.PreConsumedQuota { // when user's quota is less than pre-consumed quota, we need to fetch from db
		logger.Infof(ctx, "user %d's cached quota is too low: %d, refreshing from db", quota, id)
		return fetchAndUpdateUserQuota(ctx, id)
	}
	return quota, nil
}

func CacheUpdateUserQuota(ctx context.Context, id int) error {
	if !common.RedisEnabled {
		return nil
	}
	quota, err := CacheGetUserQuota(ctx, id)
	if err != nil {
		return err
	}
	err = common.RedisSet(fmt.Sprintf("user_quota:%d", id), fmt.Sprintf("%d", quota), time.Duration(UserId2QuotaCacheSeconds)*time.Second)
	return err
}

func CacheDecreaseUserQuota(id int, quota int64) error {
	if !common.RedisEnabled {
		return nil
	}
	err := common.RedisDecrease(fmt.Sprintf("user_quota:%d", id), int64(quota))
	return err
}

func CacheIsUserEnabled(userId int) (bool, error) {
	if !common.RedisEnabled {
		return IsUserEnabled(userId)
	}
	enabled, err := common.RedisGet(fmt.Sprintf("user_enabled:%d", userId))
	if err == nil {
		return enabled == "1", nil
	}

	userEnabled, err := IsUserEnabled(userId)
	if err != nil {
		return false, err
	}
	enabled = "0"
	if userEnabled {
		enabled = "1"
	}
	err = common.RedisSet(fmt.Sprintf("user_enabled:%d", userId), enabled, time.Duration(UserId2StatusCacheSeconds)*time.Second)
	if err != nil {
		logger.SysError("Redis set user enabled error: " + err.Error())
	}
	return userEnabled, err
}

func CacheGetGroupModels(ctx context.Context, group string) ([]string, error) {
	if !common.RedisEnabled {
		return GetGroupModels(ctx, group)
	}
	modelsStr, err := common.RedisGet(fmt.Sprintf("group_models:%s", group))
	if err == nil {
		return strings.Split(modelsStr, ","), nil
	}
	models, err := GetGroupModels(ctx, group)
	if err != nil {
		return nil, err
	}
	err = common.RedisSet(fmt.Sprintf("group_models:%s", group), strings.Join(models, ","), time.Duration(GroupModelsCacheSeconds)*time.Second)
	if err != nil {
		logger.SysError("Redis set group models error: " + err.Error())
	}
	return models, nil
}

var group2model2channels map[string]map[string][]*Channel
var channelSyncLock sync.RWMutex

func InitChannelCache() {
	newChannelId2channel := make(map[int]*Channel)
	var channels []*Channel
	DB.Where("status = ?", ChannelStatusEnabled).Find(&channels)
	for _, channel := range channels {
		newChannelId2channel[channel.Id] = channel
	}
	var abilities []*Ability
	DB.Find(&abilities)
	groups := make(map[string]bool)
	for _, ability := range abilities {
		groups[ability.Group] = true
	}
	newGroup2model2channels := make(map[string]map[string][]*Channel)
	for group := range groups {
		newGroup2model2channels[group] = make(map[string][]*Channel)
	}
	for _, channel := range channels {
		groups := strings.Split(channel.Group, ",")
		for _, group := range groups {
			if _, ok := newGroup2model2channels[group]; !ok {
				newGroup2model2channels[group] = make(map[string][]*Channel)
			}
			models := strings.Split(channel.Models, ",")
			for _, model := range models {
				if _, ok := newGroup2model2channels[group][model]; !ok {
					newGroup2model2channels[group][model] = make([]*Channel, 0)
				}
				newGroup2model2channels[group][model] = append(newGroup2model2channels[group][model], channel)
			}
		}
	}

	// sort by priority, then by cost (ascending) for cost-optimal routing (neo-matrix)
	for group, model2channels := range newGroup2model2channels {
		for model, channels := range model2channels {
			sort.Slice(channels, func(i, j int) bool {
				if channels[i].GetPriority() != channels[j].GetPriority() {
					return channels[i].GetPriority() > channels[j].GetPriority()
				}
				// 同优先级内，成本低的排前面（成本最优路由）
				return channels[i].EffectiveCost(model) < channels[j].EffectiveCost(model)
			})
			newGroup2model2channels[group][model] = channels
		}
	}

	channelSyncLock.Lock()
	group2model2channels = newGroup2model2channels
	channelSyncLock.Unlock()
	logger.SysLog("channels synced from database")
}

func SyncChannelCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		logger.SysLog("syncing channels from database")
		InitChannelCache()
	}
}

func CacheGetRandomSatisfiedChannel(group string, model string, ignoreFirstPriority bool, excludeOwnerId int) (*Channel, error) {
	if !config.MemoryCacheEnabled {
		return GetRandomSatisfiedChannel(group, model, ignoreFirstPriority, excludeOwnerId)
	}
	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()
	channels := group2model2channels[group][model]
	if len(channels) == 0 {
		return nil, errors.New("channel not found")
	}
	return pickCheapestInTopTier(channels, model, ignoreFirstPriority, excludeOwnerId)
}

// pickCheapestInTopTier 成本最优路由的选路核心（纯函数，可单测）。
// channels 已按"优先级降序 → 成本升序"排序（InitChannelCache）。
// - 正常：在最高优先级 tier 内按 WeightFactor 加权随机选渠道（成本低+信任高 → 概率大；低信任 → 小概率非零，保证爬坡）。
// - ignoreFirstPriority=true（重试）：跳过失败的最高 tier，从低优先级里随机挑一个。
//   若只有一个 tier，则退化为在 tier 内加权随机（避免重试死循环打同一个渠道）。
// - excludeOwnerId>0：跳过该供给方自己托管的渠道（套利防线，供给方不能消费自己的 Key）。
func pickCheapestInTopTier(channels []*Channel, model string, ignoreFirstPriority bool, excludeOwnerId int) (*Channel, error) {
	if len(channels) == 0 {
		return nil, errors.New("channel not found")
	}
	endIdx := len(channels)
	firstChannel := channels[0]
	if firstChannel.GetPriority() > 0 {
		for i := range channels {
			if channels[i].GetPriority() != firstChannel.GetPriority() {
				endIdx = i
				break
			}
		}
	}
	if ignoreFirstPriority && endIdx < len(channels) {
		// retry: skip the failed top tier and pick from lower tiers（同样过滤供给方自营渠道）
		lowerTier := filterOwner(channels, endIdx, len(channels), excludeOwnerId)
		if len(lowerTier) == 0 {
			// 低优先级 tier 全被过滤（都是该供给方自营）→ 拒绝自消费
			return nil, errors.New("no channel available for this user")
		}
		return lowerTier[random.RandRange(0, len(lowerTier))], nil
	}
	return weightedPick(channels[:endIdx], model, excludeOwnerId)
}

// filterOwner 返回 [start, end) 范围内 OwnerId != excludeOwnerId 的渠道切片。
// 若过滤后为空（全部是供给方自营），返回空切片。
func filterOwner(channels []*Channel, start int, end int, excludeOwnerId int) []*Channel {
	if excludeOwnerId <= 0 {
		return channels[start:end]
	}
	filtered := make([]*Channel, 0, end-start)
	for i := start; i < end; i++ {
		if channels[i].OwnerId != excludeOwnerId {
			filtered = append(filtered, channels[i])
		}
	}
	return filtered
}

// weightedPick 在 top tier（已按优先级排好、成本升序）内按 WeightFactor 加权随机取一个渠道。
// 成本越低、信任越高 → 概率越大；低信任 → 小概率但非零（爬坡）。
// 若 excludeOwnerId>0，先过滤掉该供给方自营渠道；全部被过滤则回退到全量（不放空消费者）。
func weightedPick(channels []*Channel, model string, excludeOwnerId int) (*Channel, error) {
	if len(channels) == 0 {
		return nil, errors.New("channel not found")
	}
	pickFrom := channels
	if excludeOwnerId > 0 {
		filtered := make([]*Channel, 0, len(channels))
		for _, ch := range channels {
			if ch.OwnerId != excludeOwnerId {
				filtered = append(filtered, ch)
			}
		}
		if len(filtered) == 0 {
			// 全部渠道都是该供给方自己托管的 → 拒绝自消费（防套利）。
			// 不回退到自营渠道：供给方不能用消费侧身份占用自己渠道的调度与分成。
			return nil, errors.New("no channel available for this user")
		}
		pickFrom = filtered
	}
	weights := make([]float64, len(pickFrom))
	for i, ch := range pickFrom {
		weights[i] = ch.WeightFactor(model)
	}
	idx := random.WeightedPick(weights)
	return pickFrom[idx], nil
}
