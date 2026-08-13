package logger

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/neo-matrix/neo-matrix/common/config"
	"github.com/neo-matrix/neo-matrix/common/helper"
)

// maxLogFileSize 单个日志文件大小上限（默认 50MB），超限自动切分，防磁盘写满。
// 可用环境变量 LOG_MAX_SIZE_MB 覆盖。
var maxLogFileSize int64 = func() int64 {
	mb := envInt("LOG_MAX_SIZE_MB", 50)
	if mb <= 0 {
		mb = 50
	}
	return int64(mb) * 1024 * 1024
}()

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	var n int
	if _, err := fmt.Sscanf(v, "%d", &n); err != nil {
		return def
	}
	return n
}

// rotatingFileWriter 按大小切分日志文件的 writer（标准库实现，无外部依赖）。
type rotatingFileWriter struct {
	mu       sync.Mutex
	dir      string
	baseName string // 如 oneapi-20260812
	current  *os.File
	size     int64
}

func newRotatingFileWriter(dir, baseName string) (*rotatingFileWriter, error) {
	w := &rotatingFileWriter{dir: dir, baseName: baseName}
	if err := w.rotate(); err != nil {
		return nil, err
	}
	return w, nil
}

func (w *rotatingFileWriter) rotate() error {
	// 打开当前文件（追加）
	path := filepath.Join(w.dir, w.baseName+".log")
	fd, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	if w.current != nil {
		_ = w.current.Close()
	}
	w.current = fd
	info, err := fd.Stat()
	if err != nil {
		w.size = 0
	} else {
		w.size = info.Size()
	}
	return nil
}

func (w *rotatingFileWriter) Write(p []byte) (n int, err error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.size+int64(len(p)) > maxLogFileSize {
		// 超过大小上限：重命名当前文件为 .1，开新文件
		_ = w.current.Close()
		old := filepath.Join(w.dir, w.baseName+".log")
		newPath := filepath.Join(w.dir, w.baseName+".1.log")
		_ = os.Rename(old, newPath)
		if err := w.rotate(); err != nil {
			return 0, err
		}
	}
	n, err = w.current.Write(p)
	w.size += int64(n)
	return n, err
}

type loggerLevel string

const (
	loggerDEBUG loggerLevel = "DEBUG"
	loggerINFO  loggerLevel = "INFO"
	loggerWarn  loggerLevel = "WARN"
	loggerError loggerLevel = "ERROR"
	loggerFatal loggerLevel = "FATAL"
)

var setupLogOnce sync.Once

func SetupLogger() {
	setupLogOnce.Do(func() {
		if LogDir != "" {
			var baseName string
			if config.OnlyOneLogFile {
				baseName = "oneapi"
			} else {
				baseName = fmt.Sprintf("oneapi-%s", time.Now().Format("20060102"))
			}
			// 按大小轮转的 writer，防日志单文件无限增长写满磁盘
			rw, err := newRotatingFileWriter(LogDir, baseName)
			if err != nil {
				log.Fatal("failed to open log file")
			}
			gin.DefaultWriter = io.MultiWriter(os.Stdout, rw)
			gin.DefaultErrorWriter = io.MultiWriter(os.Stderr, rw)
		}
	})
}

func SysLog(s string) {
	logHelper(nil, loggerINFO, s)
}

func SysLogf(format string, a ...any) {
	logHelper(nil, loggerINFO, fmt.Sprintf(format, a...))
}

func SysWarn(s string) {
	logHelper(nil, loggerWarn, s)
}

func SysWarnf(format string, a ...any) {
	logHelper(nil, loggerWarn, fmt.Sprintf(format, a...))
}

func SysError(s string) {
	logHelper(nil, loggerError, s)
}

func SysErrorf(format string, a ...any) {
	logHelper(nil, loggerError, fmt.Sprintf(format, a...))
}

func Debug(ctx context.Context, msg string) {
	if !config.DebugEnabled {
		return
	}
	logHelper(ctx, loggerDEBUG, msg)
}

func Info(ctx context.Context, msg string) {
	logHelper(ctx, loggerINFO, msg)
}

func Warn(ctx context.Context, msg string) {
	logHelper(ctx, loggerWarn, msg)
}

func Error(ctx context.Context, msg string) {
	logHelper(ctx, loggerError, msg)
}

func Debugf(ctx context.Context, format string, a ...any) {
	if !config.DebugEnabled {
		return
	}
	logHelper(ctx, loggerDEBUG, fmt.Sprintf(format, a...))
}

func Infof(ctx context.Context, format string, a ...any) {
	logHelper(ctx, loggerINFO, fmt.Sprintf(format, a...))
}

func Warnf(ctx context.Context, format string, a ...any) {
	logHelper(ctx, loggerWarn, fmt.Sprintf(format, a...))
}

func Errorf(ctx context.Context, format string, a ...any) {
	logHelper(ctx, loggerError, fmt.Sprintf(format, a...))
}

func FatalLog(s string) {
	logHelper(nil, loggerFatal, s)
}

func FatalLogf(format string, a ...any) {
	logHelper(nil, loggerFatal, fmt.Sprintf(format, a...))
}

func logHelper(ctx context.Context, level loggerLevel, msg string) {
	writer := gin.DefaultErrorWriter
	if level == loggerINFO {
		writer = gin.DefaultWriter
	}
	var requestId string
	if ctx != nil {
		rawRequestId := helper.GetRequestID(ctx)
		if rawRequestId != "" {
			requestId = fmt.Sprintf(" | %s", rawRequestId)
		}
	}
	lineInfo, funcName := getLineInfo()
	now := time.Now()
	_, _ = fmt.Fprintf(writer, "[%s] %v%s%s %s%s \n", level, now.Format("2006/01/02 - 15:04:05"), requestId, lineInfo, funcName, msg)
	SetupLogger()
	if level == loggerFatal {
		os.Exit(1)
	}
}

func getLineInfo() (string, string) {
	funcName := "[unknown] "
	pc, file, line, ok := runtime.Caller(3)
	if ok {
		if fn := runtime.FuncForPC(pc); fn != nil {
			parts := strings.Split(fn.Name(), ".")
			funcName = "[" + parts[len(parts)-1] + "] "
		}
	} else {
		file = "unknown"
		line = 0
	}
	parts := strings.Split(file, "one-api/")
	if len(parts) > 1 {
		file = parts[1]
	}
	return fmt.Sprintf(" | %s:%d", file, line), funcName
}
