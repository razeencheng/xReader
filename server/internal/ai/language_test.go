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
