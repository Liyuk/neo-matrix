package relay

import (
	"github.com/neo-matrix/neo-matrix/relay/adaptor"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/aiproxy"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/ali"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/anthropic"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/aws"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/baidu"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/cloudflare"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/cohere"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/coze"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/deepl"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/gemini"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/ollama"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/openai"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/palm"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/proxy"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/replicate"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/subscription"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/tencent"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/vertexai"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/xunfei"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/zhipu"
	"github.com/neo-matrix/neo-matrix/relay/apitype"
)

func GetAdaptor(apiType int) adaptor.Adaptor {
	switch apiType {
	case apitype.AIProxyLibrary:
		return &aiproxy.Adaptor{}
	case apitype.Ali:
		return &ali.Adaptor{}
	case apitype.Anthropic:
		return &anthropic.Adaptor{}
	case apitype.AwsClaude:
		return &aws.Adaptor{}
	case apitype.Baidu:
		return &baidu.Adaptor{}
	case apitype.Gemini:
		return &gemini.Adaptor{}
	case apitype.OpenAI:
		return &openai.Adaptor{}
	case apitype.PaLM:
		return &palm.Adaptor{}
	case apitype.Tencent:
		return &tencent.Adaptor{}
	case apitype.Xunfei:
		return &xunfei.Adaptor{}
	case apitype.Zhipu:
		return &zhipu.Adaptor{}
	case apitype.Ollama:
		return &ollama.Adaptor{}
	case apitype.Coze:
		return &coze.Adaptor{}
	case apitype.Cohere:
		return &cohere.Adaptor{}
	case apitype.Cloudflare:
		return &cloudflare.Adaptor{}
	case apitype.DeepL:
		return &deepl.Adaptor{}
	case apitype.VertexAI:
		return &vertexai.Adaptor{}
	case apitype.Proxy:
		return &proxy.Adaptor{}
	case apitype.Replicate:
		return &replicate.Adaptor{}
	case apitype.SubscriptionToAPI:
		return &subscription.Adaptor{}
	}
	return nil
}
