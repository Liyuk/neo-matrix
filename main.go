package main

import (
	"context"
	"embed"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"runtime/debug"
	"strconv"
	"syscall"
	"time"

	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	_ "github.com/joho/godotenv/autoload"

	"github.com/neo-matrix/neo-matrix/common"
	"github.com/neo-matrix/neo-matrix/common/client"
	"github.com/neo-matrix/neo-matrix/common/config"
	"github.com/neo-matrix/neo-matrix/common/i18n"
	"github.com/neo-matrix/neo-matrix/common/logger"
	"github.com/neo-matrix/neo-matrix/controller"
	"github.com/neo-matrix/neo-matrix/middleware"
	"github.com/neo-matrix/neo-matrix/model"
	"github.com/neo-matrix/neo-matrix/relay/adaptor/openai"
	"github.com/neo-matrix/neo-matrix/router"
)

//go:embed web/build/*
var buildFS embed.FS

// safeGo 包装后台 goroutine，panic 时记录堆栈避免整个进程崩溃。
// 后台循环（缓存同步/结算/渠道自动测试）任一 panic 都不能拖死主服务。
func safeGo(fn func(int), arg int) {
	defer func() {
		if r := recover(); r != nil {
			logger.SysError(fmt.Sprintf("background goroutine panic recovered: %v\n%s", r, string(debug.Stack())))
		}
	}()
	fn(arg)
}

func main() {
	common.Init()
	logger.SetupLogger()
	logger.SysLogf("One API %s started", common.Version)

	if os.Getenv("GIN_MODE") != gin.DebugMode {
		gin.SetMode(gin.ReleaseMode)
	}
	if config.DebugEnabled {
		logger.SysLog("running in debug mode")
	}

	// Initialize SQL Database
	model.InitDB()
	model.InitLogDB()

	var err error
	err = model.CreateRootAccountIfNeed()
	if err != nil {
		logger.FatalLog("database init error: " + err.Error())
	}
	defer func() {
		err := model.CloseDB()
		if err != nil {
			logger.FatalLog("failed to close database: " + err.Error())
		}
	}()

	// Initialize Redis
	err = common.InitRedisClient()
	if err != nil {
		logger.FatalLog("failed to initialize Redis: " + err.Error())
	}

	// Initialize options
	model.InitOptionMap()
	logger.SysLog(fmt.Sprintf("using theme %s", config.Theme))
	if common.RedisEnabled {
		// for compatibility with old versions
		config.MemoryCacheEnabled = true
	}
	if config.MemoryCacheEnabled {
		logger.SysLog("memory cache enabled")
		logger.SysLog(fmt.Sprintf("sync frequency: %d seconds", config.SyncFrequency))
		model.InitChannelCache()
	}
	if config.MemoryCacheEnabled {
		go safeGo(model.SyncOptions, config.SyncFrequency)
		go safeGo(model.SyncChannelCache, config.SyncFrequency)
	}
	if os.Getenv("CHANNEL_TEST_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("CHANNEL_TEST_FREQUENCY"))
		if err != nil {
			logger.FatalLog("failed to parse CHANNEL_TEST_FREQUENCY: " + err.Error())
		}
		go safeGo(controller.AutomaticallyTestChannels, frequency)
	}
	if os.Getenv("BATCH_UPDATE_ENABLED") == "true" {
		config.BatchUpdateEnabled = true
		logger.SysLog("batch update enabled with interval " + strconv.Itoa(config.BatchUpdateInterval) + "s")
		model.InitBatchUpdater()
	}
	if os.Getenv("SETTLEMENT_FREQUENCY") != "" {
		frequency, err := strconv.Atoi(os.Getenv("SETTLEMENT_FREQUENCY"))
		if err != nil {
			logger.FatalLog("failed to parse SETTLEMENT_FREQUENCY: " + err.Error())
		}
		go safeGo(model.SettlementLoop, frequency)
		logger.SysLog("settlement loop enabled with frequency " + strconv.Itoa(frequency) + "s")
	}
	if config.EnableMetric {
		logger.SysLog("metric enabled, will disable channel if too much request failed")
	}
	openai.InitTokenEncoders()
	client.Init()

	// Initialize i18n
	if err := i18n.Init(); err != nil {
		logger.FatalLog("failed to initialize i18n: " + err.Error())
	}

	// Initialize HTTP server
	server := gin.New()
	// 不信任任何代理：c.ClientIP() 用真实远端 IP，防 X-Forwarded-For 伪造绕过限流/网段校验。
	// 生产若在反代之后，请在反代层覆写并校验 XFF，而不是信任所有来源。
	_ = server.SetTrustedProxies(nil)
	server.Use(gin.Recovery())
	// This will cause SSE not to work!!!
	//server.Use(gzip.Gzip(gzip.DefaultCompression))
	server.Use(middleware.RequestId())
	server.Use(middleware.Language())
	middleware.SetUpLogger(server)
	// Initialize session store
	store := cookie.NewStore([]byte(config.SessionSecret))
	// SameSite=Lax + HttpOnly 会话 cookie：防跨站请求携带会话（CSRF）
	store.Options(sessions.Options{
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400 * 7,
	})
	server.Use(sessions.Sessions("session", store))

	router.SetRouter(server, buildFS)
	var port = os.Getenv("PORT")
	if port == "" {
		port = strconv.Itoa(*common.Port)
	}
	logger.SysLogf("server started on http://localhost:%s", port)

	// 优雅停机：SIGTERM/SIGINT 时先停止接收新请求、等存量请求完成再退出
	httpServer := &http.Server{
		Addr:    ":" + port,
		Handler: server,
	}
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.FatalLog("failed to start HTTP server: " + err.Error())
		}
	}()
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	logger.SysLog("shutting down gracefully...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
