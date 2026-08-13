package middleware

import (
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MaxBodyBytes 请求体大小上限（默认 10MB，可配置 MAX_BODY_MB）。
// 防超大 body 上传拖垮内存/上游。
func MaxBodySize() gin.HandlerFunc {
	maxMB := int64(10)
	if v := os.Getenv("MAX_BODY_MB"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			maxMB = n
		}
	}
	maxBytes := maxMB * 1024 * 1024
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
