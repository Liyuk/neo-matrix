package random

import (
	"github.com/google/uuid"
	"math/rand"
	"strings"
	"time"
)

func GetUUID() string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	return code
}

const keyChars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
const keyNumbers = "0123456789"

func init() {
	rand.Seed(time.Now().UnixNano())
}

func GenerateKey() string {
	rand.Seed(time.Now().UnixNano())
	key := make([]byte, 48)
	for i := 0; i < 16; i++ {
		key[i] = keyChars[rand.Intn(len(keyChars))]
	}
	uuid_ := GetUUID()
	for i := 0; i < 32; i++ {
		c := uuid_[i]
		if i%2 == 0 && c >= 'a' && c <= 'z' {
			c = c - 'a' + 'A'
		}
		key[i+16] = c
	}
	return string(key)
}

func GetRandomString(length int) string {
	rand.Seed(time.Now().UnixNano())
	key := make([]byte, length)
	for i := 0; i < length; i++ {
		key[i] = keyChars[rand.Intn(len(keyChars))]
	}
	return string(key)
}

func GetRandomNumberString(length int) string {
	rand.Seed(time.Now().UnixNano())
	key := make([]byte, length)
	for i := 0; i < length; i++ {
		key[i] = keyNumbers[rand.Intn(len(keyNumbers))]
	}
	return string(key)
}

// RandRange returns a random number between min and max (max is not included)
func RandRange(min, max int) int {
	return min + rand.Intn(max-min)
}

// WeightedPick 按权重数组加权随机取一个下标。权重全为 0 时回退均匀随机。
// weights 长度必须 > 0；总权重 <= 0（含全 0 或负数）时视为无权重，均匀随机返回一个下标。
func WeightedPick(weights []float64) int {
	total := 0.0
	for _, w := range weights {
		if w > 0 {
			total += w
		}
	}
	if total <= 0 {
		return rand.Intn(len(weights))
	}
	r := rand.Float64() * total
	for i, w := range weights {
		if w <= 0 {
			continue
		}
		r -= w
		if r <= 0 {
			return i
		}
	}
	// 浮点误差兜底：返回最后一个正权重下标
	for i := len(weights) - 1; i >= 0; i-- {
		if weights[i] > 0 {
			return i
		}
	}
	return 0
}
