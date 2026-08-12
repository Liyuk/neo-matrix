package subscription

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/neo-matrix/neo-matrix/relay/adaptor"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/openai"
	"github.com/neo-matrix/neo-matrix/relay/meta"
	"github.com/neo-matrix/neo-matrix/relay/model"
	"github.com/neo-matrix/neo-matrix/relay/relaymode"
)

// Adaptor 订阅账号转 API 的适配器（扩展预留骨架）。
// 当前实现把请求委托给 openai 适配器（订阅转 API 通常也是对 OpenAI 兼容端点转发）。
// 后续接入具体订阅服务时，替换 ConvertRequest/DoRequest 为真正的订阅协议实现
// （如登录态刷新、会话 token、每账号并发限流等）。
type Adaptor struct {
	ChannelType int
}

func (a *Adaptor) Init(meta *meta.Meta) {
	a.ChannelType = meta.ChannelType
}

func (a *Adaptor) GetRequestURL(meta *meta.Meta) (string, error) {
	return openai.GetFullRequestURL(meta.BaseURL, meta.RequestURLPath, meta.ChannelType), nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Request, meta *meta.Meta) error {
	adaptor.SetupCommonRequestHeader(c, req, meta)
	return nil
}

func (a *Adaptor) ConvertRequest(c *gin.Context, relayMode int, request *model.GeneralOpenAIRequest) (any, error) {
	if relayMode == relaymode.Moderations && request.Model == "" {
		request.Model = "text-moderation-latest"
	}
	return request, nil
}

func (a *Adaptor) ConvertImageRequest(request *model.ImageRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) DoRequest(c *gin.Context, meta *meta.Meta, requestBody io.Reader) (*http.Response, error) {
	return adaptor.DoRequestHelper(a, c, meta, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (usage *model.Usage, err *model.ErrorWithStatusCode) {
	if meta.IsStream {
		var responseText string
		err, responseText, usage = openai.StreamHandler(c, resp, meta.Mode)
		if usage == nil || usage.TotalTokens == 0 {
			usage = openai.ResponseText2Usage(responseText, meta.ActualModelName, meta.PromptTokens)
		}
		if usage.TotalTokens != 0 && usage.PromptTokens == 0 {
			usage.PromptTokens = meta.PromptTokens
			usage.CompletionTokens = usage.TotalTokens - meta.PromptTokens
		}
	} else {
		switch meta.Mode {
		case relaymode.ImagesGenerations:
			err, _ = openai.ImageHandler(c, resp)
		default:
			err, usage = openai.Handler(c, resp, meta.PromptTokens, meta.ActualModelName)
		}
	}
	return
}

func (a *Adaptor) GetModelList() []string {
	return []string{"gpt-4o", "gpt-4o-mini", "claude-sonnet-4", "claude-haiku-4"}
}

func (a *Adaptor) GetChannelName() string {
	return "subscription"
}
