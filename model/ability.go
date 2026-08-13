package model

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/neo-matrix/neo-matrix/common"
	"github.com/neo-matrix/neo-matrix/common/utils"
)

type Ability struct {
	Group     string `json:"group" gorm:"type:varchar(32);primaryKey;autoIncrement:false"`
	Model     string `json:"model" gorm:"primaryKey;autoIncrement:false"`
	ChannelId int    `json:"channel_id" gorm:"primaryKey;autoIncrement:false;index"`
	Enabled   bool   `json:"enabled"`
	Priority  *int64 `json:"priority" gorm:"bigint;default:0;index"`
}

func GetRandomSatisfiedChannel(group string, model string, ignoreFirstPriority bool, excludeOwnerId int) (*Channel, error) {
	groupCol := "`group`"
	trueVal := "1"
	if common.UsingPostgreSQL {
		groupCol = `"group"`
		trueVal = "true"
	}

	// neo-matrix: cost-optimal routing (DB path, when MEMORY_CACHE_ENABLED=false).
	// Pull all enabled candidates for (group, model) and weighted-pick the top priority tier.
	var abilities []Ability
	query := DB.Where(groupCol+" = ? and model = ? and enabled = "+trueVal, group, model)
	if err := query.Find(&abilities).Error; err != nil {
		return nil, err
	}
	if len(abilities) == 0 {
		return nil, fmt.Errorf("channel not found for model %s in group %s", model, group)
	}

	loadChannel := func(ability Ability) (*Channel, error) {
		channel := Channel{}
		channel.Id = ability.ChannelId
		if err := DB.First(&channel, "id = ?", ability.ChannelId).Error; err != nil {
			return nil, err
		}
		return &channel, nil
	}

	// 拉取 top tier 全部渠道，供加权随机（与内存路径一致）
	maxPriority := *abilities[0].Priority
	for i := 1; i < len(abilities); i++ {
		if *abilities[i].Priority > maxPriority {
			maxPriority = *abilities[i].Priority
		}
	}
	topChannels := make([]*Channel, 0, len(abilities))
	for i := range abilities {
		if *abilities[i].Priority != maxPriority {
			continue
		}
		channel, err := loadChannel(abilities[i])
		if err != nil {
			return nil, err
		}
		topChannels = append(topChannels, channel)
	}
	if len(topChannels) == 0 {
		return nil, fmt.Errorf("no enabled channel found for model %s in group %s", model, group)
	}

	if ignoreFirstPriority {
		// retry: skip the failed top priority tier, pick from lower tiers
		for i := range abilities {
			if *abilities[i].Priority < maxPriority {
				channel, err := loadChannel(abilities[i])
				if err != nil {
					return nil, err
				}
				if excludeOwnerId <= 0 || channel.OwnerId != excludeOwnerId {
					return channel, nil
				}
			}
		}
		return nil, fmt.Errorf("no lower priority channel found for model %s", model)
	}

	// normal: weighted pick within the top priority tier (cost+trust aware)
	return weightedPick(topChannels, model, excludeOwnerId)
}

func (channel *Channel) AddAbilities() error {
	models_ := strings.Split(channel.Models, ",")
	models_ = utils.DeDuplication(models_)
	groups_ := strings.Split(channel.Group, ",")
	abilities := make([]Ability, 0, len(models_))
	for _, model := range models_ {
		for _, group := range groups_ {
			ability := Ability{
				Group:     group,
				Model:     model,
				ChannelId: channel.Id,
				Enabled:   channel.Status == ChannelStatusEnabled,
				Priority:  channel.Priority,
			}
			abilities = append(abilities, ability)
		}
	}
	return DB.Create(&abilities).Error
}

func (channel *Channel) DeleteAbilities() error {
	return DB.Where("channel_id = ?", channel.Id).Delete(&Ability{}).Error
}

// UpdateAbilities updates abilities of this channel.
// Make sure the channel is completed before calling this function.
func (channel *Channel) UpdateAbilities() error {
	// A quick and dirty way to update abilities
	// First delete all abilities of this channel
	err := channel.DeleteAbilities()
	if err != nil {
		return err
	}
	// Then add new abilities
	err = channel.AddAbilities()
	if err != nil {
		return err
	}
	return nil
}

func UpdateAbilityStatus(channelId int, status bool) error {
	return DB.Model(&Ability{}).Where("channel_id = ?", channelId).Select("enabled").Update("enabled", status).Error
}

func GetGroupModels(ctx context.Context, group string) ([]string, error) {
	groupCol := "`group`"
	trueVal := "1"
	if common.UsingPostgreSQL {
		groupCol = `"group"`
		trueVal = "true"
	}
	var models []string
	err := DB.Model(&Ability{}).Distinct("model").Where(groupCol+" = ? and enabled = "+trueVal, group).Pluck("model", &models).Error
	if err != nil {
		return nil, err
	}
	sort.Strings(models)
	return models, err
}
