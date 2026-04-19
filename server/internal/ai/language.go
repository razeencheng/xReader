package ai

import "github.com/abadojack/whatlanggo"

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
