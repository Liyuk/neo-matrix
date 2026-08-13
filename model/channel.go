package model

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/neo-matrix/neo-matrix/common/config"
	"github.com/neo-matrix/neo-matrix/common/helper"
	"github.com/neo-matrix/neo-matrix/common/logger"
	"gorm.io/gorm"
)

const (
	ChannelStatusUnknown          = 0
	ChannelStatusEnabled          = 1 // don't use 0, 0 is the default value!
	ChannelStatusManuallyDisabled = 2 // also don't use 0
	ChannelStatusAutoDisabled     = 3
)

// 成本申报状态（CostDeclStatus）
const (
	CostDeclNone     = 0 // 未申报
	CostDeclPending  = 1 // 待审
	CostDeclApproved = 2 // 已核准
	CostDeclRejected = 3 // 已驳回
)

type Channel struct {
	Id                 int     `json:"id"`
	Type               int     `json:"type" gorm:"default:0"`
	Key                string  `json:"key" gorm:"type:text"`
	Status             int     `json:"status" gorm:"default:1"`
	Name               string  `json:"name" gorm:"index"`
	Weight             *uint   `json:"weight" gorm:"default:0"`
	CreatedTime        int64   `json:"created_time" gorm:"bigint"`
	TestTime           int64   `json:"test_time" gorm:"bigint"`
	ResponseTime       int     `json:"response_time"` // in milliseconds
	BaseURL            *string `json:"base_url" gorm:"column:base_url;default:''"`
	Other              *string `json:"other"`   // DEPRECATED: please save config to field Config
	Balance            float64 `json:"balance"` // in USD
	BalanceUpdatedTime int64   `json:"balance_updated_time" gorm:"bigint"`
	Models             string  `json:"models"`
	Group              string  `json:"group" gorm:"type:varchar(32);default:'default'"`
	UsedQuota          int64   `json:"used_quota" gorm:"bigint;default:0"`
	ModelMapping       *string `json:"model_mapping" gorm:"type:varchar(1024);default:''"`
	Priority           *int64  `json:"priority" gorm:"bigint;default:0"`
	Config             string  `json:"config"`
	SystemPrompt       *string `json:"system_prompt" gorm:"type:text"`
	// neo-matrix: 供给方归属与成本
	OwnerId        int     `json:"owner_id" gorm:"default:0"` // 供给方 users.id；0=平台自有渠道
	CostRatio      float64 `json:"cost_ratio" gorm:"default:1.0"` // 成本倍率：1.0 = 成本价等于零售价(ModelRatio)
	ModelCostRatio string  `json:"model_cost_ratio" gorm:"type:text;default:'{}'"` // JSON: {"gpt-4o":0.5} 每模型成本价(覆盖 CostRatio)
	IsShared       int     `json:"is_shared" gorm:"default:0"` // 1=供给方托管渠道
	SettleEnabled  int     `json:"settle_enabled" gorm:"default:1"` // 是否参与分成结算
	// neo-matrix: 信任阶梯与成本申报
	TrustLevel    int    `json:"trust_level" gorm:"default:1"` // 渠道信任等级 1-5（1=新接入起步，5=高信任）。路由加权随机按此放大成本
	CostDeclStatus int   `json:"cost_decl_status" gorm:"default:0"` // 成本申报状态 0未申报/1待审/2核准/3驳回
	CostDeclNote  string `json:"cost_decl_note" gorm:"type:text"`   // 申报说明/审批理由
}

// GetCostRatio 返回该渠道在某模型上的成本倍率：
// 优先命中 ModelCostRatio JSON 里的模型级配置，否则回退到 CostRatio。
func (channel *Channel) GetCostRatio(model string) float64 {
	if channel.ModelCostRatio != "" && channel.ModelCostRatio != "{}" {
		m := make(map[string]float64)
		if err := json.Unmarshal([]byte(channel.ModelCostRatio), &m); err == nil {
			if ratio, ok := m[model]; ok && ratio > 0 {
				return ratio
			}
		}
	}
	if channel.CostRatio > 0 {
		return channel.CostRatio
	}
	return 1.0
}

// EffectiveCost 渠道相对零售价 ModelRatio 的成本倍率，用于成本最优路由排序。
func (channel *Channel) EffectiveCost(model string) float64 {
	return channel.GetCostRatio(model)
}

// GetTrustLevel 渠道信任等级（1-5），nil/非法值回退 1。
func (channel *Channel) GetTrustLevel() int {
	if channel.TrustLevel < 1 {
		return 1
	}
	if channel.TrustLevel > 5 {
		return 5
	}
	return channel.TrustLevel
}

// trustPenaltyFactor 低信任放大成本，让低信任渠道在加权随机里概率更低（但非零，保证能爬坡）。
// 信任 1 → ×TRUST_PENALTY_LV1（默认 5.0）；信任 2 → ×TRUST_PENALTY_LV2（默认 3.0）；信任 3+ → ×1.0。
// 可通过环境变量 TRUST_PENALTY_LV1/LV2 调整力度（值越大，低信任渠道越难被选中）。
// 注意：仅用于路由（RoutingCost/WeightFactor），不用于结算（EffectiveCost 保持纯成本）。
func trustPenaltyFactor(trustLevel int) float64 {
	switch trustLevel {
	case 1:
		if config.TrustPenaltyLv1 > 1.0 {
			return config.TrustPenaltyLv1
		}
		return 5.0
	case 2:
		if config.TrustPenaltyLv2 > 1.0 {
			return config.TrustPenaltyLv2
		}
		return 3.0
	default:
		return 1.0
	}
}

// RoutingCost 路由专用成本 = 成本倍率 × 信任惩罚。低信任渠道成本被放大 → 加权随机里选中概率低。
// 与 EffectiveCost 的差别：EffectiveCost 是纯成本（用于结算 cost_quota），RoutingCost 额外含信任惩罚（仅路由）。
func (channel *Channel) RoutingCost(model string) float64 {
	return channel.GetCostRatio(model) * trustPenaltyFactor(channel.GetTrustLevel())
}

// WeightFactor 加权随机分值 = 1 / RoutingCost。成本越低、信任越高 → 分值越高 → 选中概率越大。
// 低信任渠道分值低但非零 → 偶尔被选中拿到流量爬坡。
func (channel *Channel) WeightFactor(model string) float64 {
	cost := channel.RoutingCost(model)
	if cost <= 0 {
		return 1.0
	}
	return 1.0 / cost
}

type ChannelConfig struct {
	Region            string `json:"region,omitempty"`
	SK                string `json:"sk,omitempty"`
	AK                string `json:"ak,omitempty"`
	UserID            string `json:"user_id,omitempty"`
	APIVersion        string `json:"api_version,omitempty"`
	LibraryID         string `json:"library_id,omitempty"`
	Plugin            string `json:"plugin,omitempty"`
	VertexAIProjectID string `json:"vertex_ai_project_id,omitempty"`
	VertexAIADC       string `json:"vertex_ai_adc,omitempty"`
}

func GetAllChannels(startIdx int, num int, scope string) ([]*Channel, error) {
	var channels []*Channel
	var err error
	switch scope {
	case "all":
		err = DB.Order("id desc").Find(&channels).Error
	case "disabled":
		err = DB.Order("id desc").Where("status = ? or status = ?", ChannelStatusAutoDisabled, ChannelStatusManuallyDisabled).Find(&channels).Error
	default:
		err = DB.Order("id desc").Limit(num).Offset(startIdx).Omit("key").Find(&channels).Error
	}
	return channels, err
}

func SearchChannels(keyword string) (channels []*Channel, err error) {
	err = DB.Omit("key").Where("id = ? or name LIKE ?", helper.String2Int(keyword), keyword+"%").Find(&channels).Error
	return channels, err
}

func GetChannelById(id int, selectAll bool) (*Channel, error) {
	channel := Channel{Id: id}
	var err error = nil
	if selectAll {
		err = DB.First(&channel, "id = ?", id).Error
	} else {
		err = DB.Omit("key").First(&channel, "id = ?", id).Error
	}
	return &channel, err
}

func BatchInsertChannels(channels []Channel) error {
	var err error
	err = DB.Create(&channels).Error
	if err != nil {
		return err
	}
	for _, channel_ := range channels {
		err = channel_.AddAbilities()
		if err != nil {
			return err
		}
	}
	return nil
}

func (channel *Channel) GetPriority() int64 {
	if channel.Priority == nil {
		return 0
	}
	return *channel.Priority
}

func (channel *Channel) GetBaseURL() string {
	if channel.BaseURL == nil {
		return ""
	}
	return *channel.BaseURL
}

func (channel *Channel) GetModelMapping() map[string]string {
	if channel.ModelMapping == nil || *channel.ModelMapping == "" || *channel.ModelMapping == "{}" {
		return nil
	}
	modelMapping := make(map[string]string)
	err := json.Unmarshal([]byte(*channel.ModelMapping), &modelMapping)
	if err != nil {
		logger.SysError(fmt.Sprintf("failed to unmarshal model mapping for channel %d, error: %s", channel.Id, err.Error()))
		return nil
	}
	return modelMapping
}

func (channel *Channel) Insert() error {
	var err error
	err = DB.Create(channel).Error
	if err != nil {
		return err
	}
	err = channel.AddAbilities()
	return err
}

func (channel *Channel) Update() error {
	var err error
	err = DB.Model(channel).Updates(channel).Error
	if err != nil {
		return err
	}
	DB.Model(channel).First(channel, "id = ?", channel.Id)
	err = channel.UpdateAbilities()
	return err
}

func (channel *Channel) UpdateResponseTime(responseTime int64) {
	err := DB.Model(channel).Select("response_time", "test_time").Updates(Channel{
		TestTime:     helper.GetTimestamp(),
		ResponseTime: int(responseTime),
	}).Error
	if err != nil {
		logger.SysError("failed to update response time: " + err.Error())
	}
}

func (channel *Channel) UpdateBalance(balance float64) {
	err := DB.Model(channel).Select("balance_updated_time", "balance").Updates(Channel{
		BalanceUpdatedTime: helper.GetTimestamp(),
		Balance:            balance,
	}).Error
	if err != nil {
		logger.SysError("failed to update balance: " + err.Error())
	}
}

func (channel *Channel) Delete() error {
	var err error
	err = DB.Delete(channel).Error
	if err != nil {
		return err
	}
	err = channel.DeleteAbilities()
	return err
}

func (channel *Channel) LoadConfig() (ChannelConfig, error) {
	var cfg ChannelConfig
	if channel.Config == "" {
		return cfg, nil
	}
	err := json.Unmarshal([]byte(channel.Config), &cfg)
	if err != nil {
		return cfg, err
	}
	return cfg, nil
}

func UpdateChannelStatusById(id int, status int) {
	err := UpdateAbilityStatus(id, status == ChannelStatusEnabled)
	if err != nil {
		logger.SysError("failed to update ability status: " + err.Error())
	}
	err = DB.Model(&Channel{}).Where("id = ?", id).Update("status", status).Error
	if err != nil {
		logger.SysError("failed to update channel status: " + err.Error())
	}
}

// ReviewChannelCostDecl 管理员审批渠道成本申报。
// status: CostDeclApproved=核准 / CostDeclRejected=驳回；note 为审批理由。
// 核准时可顺带指定信任等级（trustLevel>0 时覆盖渠道信任），未指定则维持现状。
func ReviewChannelCostDecl(id int, status int, note string, trustLevel int) error {
	update := map[string]interface{}{
		"cost_decl_status": status,
		"cost_decl_note":   note,
	}
	if trustLevel >= 1 && trustLevel <= 5 {
		update["trust_level"] = trustLevel
	}
	if err := DB.Model(&Channel{}).Where("id = ?", id).Updates(update).Error; err != nil {
		return err
	}
	return nil
}

// UpdateChannelTrust 更新渠道信任等级（1-5），并刷新路由缓存（低信任渠道调度的概率倾斜即时生效）。
func UpdateChannelTrust(channelId int, level int) error {
	if level < 1 {
		level = 1
	}
	if level > 5 {
		level = 5
	}
	err := DB.Model(&Channel{}).Where("id = ?", channelId).Update("trust_level", level).Error
	if err != nil {
		return err
	}
	InitChannelCache()
	return nil
}

func UpdateChannelUsedQuota(id int, quota int64) {
	if config.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeChannelUsedQuota, id, quota)
		return
	}
	updateChannelUsedQuota(id, quota)
}

func updateChannelUsedQuota(id int, quota int64) {
	err := DB.Model(&Channel{}).Where("id = ?", id).Update("used_quota", gorm.Expr("used_quota + ?", quota)).Error
	if err != nil {
		logger.SysError("failed to update channel used quota: " + err.Error())
	}
}

func DeleteChannelByStatus(status int64) (int64, error) {
	result := DB.Where("status = ?", status).Delete(&Channel{})
	return result.RowsAffected, result.Error
}

func DeleteDisabledChannel() (int64, error) {
	result := DB.Where("status = ? or status = ?", ChannelStatusAutoDisabled, ChannelStatusManuallyDisabled).Delete(&Channel{})
	return result.RowsAffected, result.Error
}

// GetChannelsByOwner 返回某供给方托管的所有渠道（neo-matrix）。
func GetChannelsByOwner(ownerId int) ([]*Channel, error) {
	var channels []*Channel
	err := DB.Where("owner_id = ?", ownerId).Order("id desc").Find(&channels).Error
	return channels, err
}

// GetChannelsByCostDeclStatus 返回指定成本申报状态的渠道（管理端审批用，neo-matrix）。
func GetChannelsByCostDeclStatus(status int) ([]*Channel, error) {
	var channels []*Channel
	err := DB.Where("cost_decl_status = ?", status).Order("id desc").Find(&channels).Error
	return channels, err
}

// DeleteChannelById 删除渠道及其能力表记录（neo-matrix）。
func DeleteChannelById(id int) error {
	if err := DB.Delete(&Channel{}, "id = ?", id).Error; err != nil {
		return err
	}
	channel := Channel{Id: id}
	return channel.DeleteAbilities()
}

// GetFirstModel 取渠道配置的第一个模型作为测试模型（neo-matrix）。
func (channel *Channel) GetFirstModel() string {
	models := strings.Split(channel.Models, ",")
	for _, m := range models {
		if m != "" {
			return m
		}
	}
	return ""
}
