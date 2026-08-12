package controller

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/neo-matrix/neo-matrix/common/ctxkey"
	"github.com/neo-matrix/neo-matrix/common/helper"
	"github.com/neo-matrix/neo-matrix/model"
	"github.com/neo-matrix/neo-matrix/relay/channeltype"
)

// 供给方允许提交的渠道类型白名单（OpenAI 兼容为主，订阅转 API 后续在此扩展）
var supplierAllowedChannelTypes = map[int]bool{
	channeltype.OpenAI:           true, // 1
	channeltype.OpenAICompatible: true, // 50
	channeltype.Anthropic:        true, // 18
	channeltype.Gemini:           true, // 24
	channeltype.DeepSeek:         true, // 40
}

// SupplierApply 申请成为供给方（幂等）
func SupplierApply(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	supplier, err := model.ApplySupplier(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": supplier})
}

// SupplierSelf 获取当前供给方信息
func SupplierSelf(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	supplier, err := model.GetSupplierByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "还不是供给方： " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": supplier})
}

// SupplierChannels 供给方自己的托管渠道列表
func SupplierChannels(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	channels, err := model.GetChannelsByOwner(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": channels})
}

// SupplierAddChannel 供给方提交 Key → 预校验 → 自动建渠道
func SupplierAddChannel(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	if _, err := model.GetSupplierByUserId(userId); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请先申请成为供给方"})
		return
	}
	channel := model.Channel{}
	if err := c.ShouldBindJSON(&channel); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// 白名单校验渠道类型
	if !supplierAllowedChannelTypes[channel.Type] {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "该渠道类型暂不支持供给方接入"})
		return
	}
	// Key 必填
	if strings.TrimSpace(channel.Key) == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "API Key 不能为空"})
		return
	}
	// 成本倍率合法性（防恶意低报，下限 0.01）
	if channel.CostRatio <= 0 {
		channel.CostRatio = 1.0
	}
	if channel.CostRatio < 0.01 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "成本倍率过低，请填写真实成本"})
		return
	}
	// 预校验：用临时 channel 跑一次测试请求
	tmpChannel := channel
	tmpChannel.Id = 0
	testReq := buildTestRequest(channel.GetFirstModel())
	_, err, openAIErr := testChannel(context.Background(), &tmpChannel, testReq)
	if err != nil || openAIErr != nil {
		msg := "渠道测试失败"
		if err != nil {
			msg = err.Error()
		} else if openAIErr != nil {
			msg = openAIErr.Message
		}
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "Key 校验失败：" + msg})
		return
	}
	// 组装为供给方托管渠道
	channel.OwnerId = userId
	channel.IsShared = 1
	channel.SettleEnabled = 1
	channel.Status = model.ChannelStatusEnabled
	channel.Group = "default" // 供给方渠道服务默认分组
	channel.CreatedTime = helper.GetTimestamp()
	if err := channel.Insert(); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	// 立即刷新路由缓存（否则 SyncFrequency=600s 延迟生效）
	model.InitChannelCache()
	// 异步拉余额，防超卖
	go func() {
		if isBalanceSupported(channel.Type) {
			updateChannelBalance(&channel)
		}
	}()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "渠道创建成功", "data": channel.Id})
}

// SupplierDeleteChannel 供给方删除自己的渠道
func SupplierDeleteChannel(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	channel, err := model.GetChannelById(id, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if channel.OwnerId != userId {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "无权删除该渠道"})
		return
	}
	if err := model.DeleteChannelById(id); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	model.InitChannelCache()
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "删除成功"})
}

func isBalanceSupported(channelType int) bool {
	switch channelType {
	case channeltype.OpenAI, channeltype.OpenAICompatible, channeltype.DeepSeek:
		return true
	}
	return false
}

// SupplierDashboard 供给方收益看板：余额总览 + 我的渠道用量
func SupplierDashboard(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	supplier, err := model.GetSupplierByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "还不是供给方"})
		return
	}
	channels, _ := model.GetChannelsByOwner(userId)
	settlements, _ := model.GetSettlementsBySupplier(supplier.Id)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"supplier":    supplier,
			"channels":    channels,
			"settlements": settlements,
		},
	})
}

// SupplierSettlements 供给方自己的结算记录
func SupplierSettlements(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	supplier, err := model.GetSupplierByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "还不是供给方"})
		return
	}
	settlements, err := model.GetSettlementsBySupplier(supplier.Id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": settlements})
}

// SupplierWithdraw 发起提现申请
func SupplierWithdraw(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	supplier, err := model.GetSupplierByUserId(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "还不是供给方"})
		return
	}
	var req struct {
		AmountQuota int    `json:"amount_quota"`
		PayMethod   string `json:"pay_method"`
		PayAccount  string `json:"pay_account"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.AmountQuota <= 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "提现金额必须大于 0"})
		return
	}
	if req.PayMethod == "" || req.PayAccount == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请填写收款方式与账号"})
		return
	}
	if err := supplier.RequestWithdrawal(req.AmountQuota); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	now := helper.GetTimestamp()
	withdrawal := model.Withdrawal{
		SupplierId:  supplier.Id,
		UserId:      userId,
		AmountQuota: req.AmountQuota,
		AmountFiat:  float64(req.AmountQuota) * model.QuotaToRMB,
		PayMethod:   req.PayMethod,
		PayAccount:  req.PayAccount,
		Status:      model.WithdrawalStatusPending,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if err := model.CreateWithdrawal(&withdrawal); err != nil {
		// 回滚扣减
		_ = model.UpdateSupplierBalance(userId, req.AmountQuota, "withdraw")
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "提现申请已提交，等待审核"})
}

// SupplierWithdrawals 供给方自己的提现记录
func SupplierWithdrawals(c *gin.Context) {
	userId := c.GetInt(ctxkey.Id)
	withdrawals, err := model.GetWithdrawalsByUser(userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": withdrawals})
}

// --- 管理端 ---

// AdminSettlements 结算单列表（管理端）
func AdminSettlements(c *gin.Context) {
	settlements, err := model.GetAllSettlements()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": settlements})
}

// AdminRunSettlement 手动触发结算
func AdminRunSettlement(c *gin.Context) {
	var req struct {
		PeriodStart int64 `json:"period_start"`
		PeriodEnd   int64 `json:"period_end"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if req.PeriodStart == 0 || req.PeriodEnd == 0 {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "请指定结算周期"})
		return
	}
	count, err := model.GenerateSettlement(req.PeriodStart, req.PeriodEnd)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"count": count}})
}

// AdminUpdateSettlement 确认结算（settling → withdraw）
func AdminUpdateSettlement(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := model.ConfirmSettlement(id); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "结算已确认"})
}

// AdminWithdrawals 提现审核列表
func AdminWithdrawals(c *gin.Context) {
	withdrawals, err := model.GetAllWithdrawals()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": withdrawals})
}

// AdminUpdateWithdrawal 审核提现：通过(打款)或驳回(退余额)
func AdminUpdateWithdrawal(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	var req struct {
		Status int    `json:"status"`
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := model.ProcessWithdrawal(id, req.Status, req.Reason); err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "操作成功"})
}
