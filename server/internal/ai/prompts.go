package ai

import "fmt"

func TitleTranslationPrompt(targetLang string) string {
	switch targetLang {
	case "zh-CN":
		return "你是一个翻译助手。将以下标题翻译成中文，只输出翻译结果，不要任何解释。"
	case "en":
		return "You are a translation assistant. Translate the following title into English. Output only the translation, no explanations."
	default:
		return fmt.Sprintf("Translate the following title into %s. Output only the translation.", targetLang)
	}
}

func SummaryPrompt(targetLang string) string {
	switch targetLang {
	case "zh-CN":
		return "你是一个信息摘要助手。请将以下文章内容提炼为3-5个要点，使用中文，每个要点一行，以「•」开头。只输出要点，不要其他内容。"
	case "en":
		return "You are a summarization assistant. Extract 3-5 key points from the following article. One point per line, starting with '•'. Output only the key points."
	default:
		return fmt.Sprintf("Extract 3-5 key points from the following article in %s. One per line, starting with '•'. Output only the points.", targetLang)
	}
}
