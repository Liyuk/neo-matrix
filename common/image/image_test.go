package image_test

import (
	"encoding/base64"
	"github.com/neo-matrix/neo-matrix/common/client"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	img "github.com/neo-matrix/neo-matrix/common/image"

	"github.com/stretchr/testify/assert"
	_ "golang.org/x/image/webp"
)

type CountingReader struct {
	reader    io.Reader
	BytesRead int
}

func (r *CountingReader) Read(p []byte) (n int, err error) {
	n, err = r.reader.Read(p)
	r.BytesRead += n
	return n, err
}

// cases 使用本地 fixture（testdata/）而非外部 URL，测试不依赖网络。
// 各 fixture 由 scripts/gen-fixtures.py 生成，尺寸即文件名对应值。
var cases = []struct {
	file   string
	format string
	width  int
	height int
}{
	{"boardwalk.jpeg", "jpeg", 640, 360},
	{"basshunter.png", "png", 100, 80},
	{"somethingness.webp", "webp", 90, 60},
	{"sandberg.gif", "gif", 50, 40},
	{"cervus.jpeg", "jpeg", 270, 230},
}

// localServer 用 httptest 在本地提供 testdata/ 目录下的图片，
// 让依赖 URL 的用例（GetImageSizeFromUrl 等）不需要外网。
var localServer *httptest.Server

func TestMain(m *testing.M) {
	client.Init()
	localServer = httptest.NewServer(http.FileServer(http.Dir("testdata")))
	code := m.Run()
	localServer.Close()
	os.Exit(code)
}

func caseURLs() []struct {
	url    string
	format string
	width  int
	height int
} {
	out := make([]struct {
		url    string
		format string
		width  int
		height int
	}, 0, len(cases))
	for _, c := range cases {
		out = append(out, struct {
			url    string
			format string
			width  int
			height int
		}{localServer.URL + "/" + c.file, c.format, c.width, c.height})
	}
	return out
}

// 直接读取本地 fixture，供 base64 / decode 用例使用，不经过网络。
func readFixture(t *testing.T, file string) []byte {
	data, err := os.ReadFile(filepath.Join("testdata", file))
	assert.NoError(t, err)
	return data
}

func TestDecode(t *testing.T) {
	// Bytes read: varies sometimes
	// jpeg: 1063892
	// png: 294462
	// webp: 99529
	// gif: 956153
	// jpeg#01: 32805
	for _, c := range caseURLs() {
		t.Run("Decode:"+c.format, func(t *testing.T) {
			resp, err := http.Get(c.url)
			assert.NoError(t, err)
			defer resp.Body.Close()
			reader := &CountingReader{reader: resp.Body}
			img, format, err := image.Decode(reader)
			assert.NoError(t, err)
			size := img.Bounds().Size()
			assert.Equal(t, c.format, format)
			assert.Equal(t, c.width, size.X)
			assert.Equal(t, c.height, size.Y)
			t.Logf("Bytes read: %d", reader.BytesRead)
		})
	}

	// Bytes read:
	// jpeg: 4096
	// png: 4096
	// webp: 4096
	// gif: 4096
	// jpeg#01: 4096
	for _, c := range caseURLs() {
		t.Run("DecodeConfig:"+c.format, func(t *testing.T) {
			resp, err := http.Get(c.url)
			assert.NoError(t, err)
			defer resp.Body.Close()
			reader := &CountingReader{reader: resp.Body}
			config, format, err := image.DecodeConfig(reader)
			assert.NoError(t, err)
			assert.Equal(t, c.format, format)
			assert.Equal(t, c.width, config.Width)
			assert.Equal(t, c.height, config.Height)
			t.Logf("Bytes read: %d", reader.BytesRead)
		})
	}
}

func TestBase64(t *testing.T) {
	// Bytes read:
	// jpeg: 1063892
	// png: 294462
	// webp: 99072
	// gif: 953856
	// jpeg#01: 32805
	for _, c := range cases {
		t.Run("Decode:"+c.format, func(t *testing.T) {
			data := readFixture(t, c.file)
			encoded := base64.StdEncoding.EncodeToString(data)
			body := base64.NewDecoder(base64.StdEncoding, strings.NewReader(encoded))
			reader := &CountingReader{reader: body}
			img, format, err := image.Decode(reader)
			assert.NoError(t, err)
			size := img.Bounds().Size()
			assert.Equal(t, c.format, format)
			assert.Equal(t, c.width, size.X)
			assert.Equal(t, c.height, size.Y)
			t.Logf("Bytes read: %d", reader.BytesRead)
		})
	}

	// Bytes read:
	// jpeg: 1536
	// png: 768
	// webp: 768
	// gif: 1536
	// jpeg#01: 3840
	for _, c := range cases {
		t.Run("DecodeConfig:"+c.format, func(t *testing.T) {
			data := readFixture(t, c.file)
			encoded := base64.StdEncoding.EncodeToString(data)
			body := base64.NewDecoder(base64.StdEncoding, strings.NewReader(encoded))
			reader := &CountingReader{reader: body}
			config, format, err := image.DecodeConfig(reader)
			assert.NoError(t, err)
			assert.Equal(t, c.format, format)
			assert.Equal(t, c.width, config.Width)
			assert.Equal(t, c.height, config.Height)
			t.Logf("Bytes read: %d", reader.BytesRead)
		})
	}
}

func TestGetImageSize(t *testing.T) {
	for i, c := range caseURLs() {
		t.Run("Decode:"+strconv.Itoa(i), func(t *testing.T) {
			width, height, err := img.GetImageSize(c.url)
			assert.NoError(t, err)
			assert.Equal(t, c.width, width)
			assert.Equal(t, c.height, height)
		})
	}
}

func TestGetImageSizeFromBase64(t *testing.T) {
	for i, c := range cases {
		t.Run("Decode:"+strconv.Itoa(i), func(t *testing.T) {
			data := readFixture(t, c.file)
			encoded := base64.StdEncoding.EncodeToString(data)
			width, height, err := img.GetImageSizeFromBase64(encoded)
			assert.NoError(t, err)
			assert.Equal(t, c.width, width)
			assert.Equal(t, c.height, height)
		})
	}
}
