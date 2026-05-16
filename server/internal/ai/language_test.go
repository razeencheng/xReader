package ai

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLanguageDetect_ChineseText(t *testing.T) {
	text := "今天的天气非常好，适合出去散步。这是一个关于人工智能在日常生活中应用的讨论。"
	lang := DetectLanguage(text, "")
	require.Equal(t, "zh-CN", lang)
}

func TestLanguageDetect_EnglishText(t *testing.T) {
	text := "The weather is very nice today. This article discusses the impact of artificial intelligence on daily life."
	lang := DetectLanguage(text, "")
	require.Equal(t, "en", lang)
}

func TestLanguageDetect_ShortTextFallsBackToHint(t *testing.T) {
	lang := DetectLanguage("hi", "ja")
	require.Equal(t, "ja", lang)
}

func TestLanguageDetect_ShortTextNoFallback(t *testing.T) {
	lang := DetectLanguage("hi", "")
	require.Equal(t, "unknown", lang)
}

func TestLanguageDetect_ShortChineseWithLatinPrefix(t *testing.T) {
	lang := DetectLanguage("R#099 合理休假", "")
	require.Equal(t, "zh-CN", lang)
}

func TestLanguageDetect_MixedChineseEnglish(t *testing.T) {
	lang := DetectLanguage("Gadget System Framework（GSF）- 我开发的一个 Windows 10/11 桌面小工具框架", "")
	require.Equal(t, "zh-CN", lang)
}

func TestDetectTitleLanguage(t *testing.T) {
	cases := []struct {
		name  string
		title string
		want  string
	}{
		{"english short", "Breaking News: AI Progress", "en"},
		{"english tiny", "Go 1.24 released", "en"},
		{"chinese", "人工智能的最新进展", "zh-CN"},
		{"japanese kana", "アニメの新作発表", "ja"},
		{"korean", "인공지능 뉴스", "ko"},
		{"mixed han-present", "OpenAI 发布 GPT-5", "zh-CN"},
		{"numbers/symbols only", "2026 — #1!", ""},
		{"empty", "", ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := DetectTitleLanguage(c.title); got != c.want {
				t.Fatalf("DetectTitleLanguage(%q) = %q, want %q", c.title, got, c.want)
			}
		})
	}
}

func TestNormalizeLangCode(t *testing.T) {
	cases := map[string]string{
		"zh-CN": "zh-CN",
		"en-US": "en",
		"ja-JP": "ja",
		"ko-KR": "ko",
		"en":    "en",
		"ja":    "ja",
		"":      "",
	}
	for in, want := range cases {
		if got := NormalizeLangCode(in); got != want {
			t.Fatalf("NormalizeLangCode(%q) = %q, want %q", in, got, want)
		}
	}
}
