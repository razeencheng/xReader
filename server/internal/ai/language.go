package ai

import (
	"unicode"

	"github.com/abadojack/whatlanggo"
)

var langMap = map[whatlanggo.Lang]string{
	whatlanggo.Cmn: "zh-CN",
	whatlanggo.Eng: "en",
	whatlanggo.Jpn: "ja",
	whatlanggo.Kor: "ko",
	whatlanggo.Fra: "fr",
	whatlanggo.Deu: "de",
	whatlanggo.Spa: "es",
	whatlanggo.Rus: "ru",
	whatlanggo.Por: "pt",
	whatlanggo.Ita: "it",
}

func DetectLanguage(text string, fallback string) string {
	if cjk := detectCJKByRunes(text); cjk != "" {
		return cjk
	}

	if len(text) < 50 {
		if fallback != "" {
			return fallback
		}
		return "unknown"
	}

	info := whatlanggo.Detect(text)
	if code, ok := langMap[info.Lang]; ok {
		return code
	}
	if fallback != "" {
		return fallback
	}
	return "unknown"
}

func detectCJKByRunes(text string) string {
	var han, hiragana, katakana, hangul, total int
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) || unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) {
			total++
			switch {
			case unicode.Is(unicode.Han, r):
				han++
			case unicode.Is(unicode.Hiragana, r):
				hiragana++
			case unicode.Is(unicode.Katakana, r):
				katakana++
			case unicode.Is(unicode.Hangul, r):
				hangul++
			}
		}
	}
	if total < 4 {
		return ""
	}
	cjk := han + hiragana + katakana + hangul
	if cjk*100/total < 15 {
		return ""
	}
	if hiragana+katakana > han {
		return "ja"
	}
	if hangul > han {
		return "ko"
	}
	if han > 0 {
		return "zh-CN"
	}
	return ""
}
