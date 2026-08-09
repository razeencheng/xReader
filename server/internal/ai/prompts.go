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
		return `你是一个信息摘要助手。请用中文提炼文章的一句主旨和 2 到 4 条简短要点，总字数控制在 200 字以内。不要重复，不要虚构原文没有的信息，避免“本文介绍了”之类的空话。

严格按以下格式输出，不要输出其他任何内容：
SUMMARY_LEAD: 一句主旨
SUMMARY_POINT: 第一条要点
SUMMARY_POINT: 第二条要点`
	case "en":
		return `You are a summarization assistant. Extract one concise lead and 2 to 4 short key points from the article, using no more than 100 words total. Do not repeat points, invent facts, or use empty phrases such as "this article discusses."

Output strictly in this format, nothing else:
SUMMARY_LEAD: one-sentence lead
SUMMARY_POINT: first key point
SUMMARY_POINT: second key point`
	default:
		return fmt.Sprintf(`Summarize the article in %s as one concise lead and 2 to 4 short key points, using no more than about 100 words total. Do not repeat points or invent facts.

Output strictly in this format, nothing else:
SUMMARY_LEAD: one-sentence lead
SUMMARY_POINT: first key point
SUMMARY_POINT: second key point`, targetLang)
	}
}

func CombinedTitleSummaryPrompt(targetLang string) string {
	switch targetLang {
	case "zh-CN":
		return `你是一个翻译和摘要助手。请完成以下两个任务：
1. 将标题翻译成中文
2. 将正文提炼为一句主旨和 2 到 4 条简短要点，总字数控制在 200 字以内；不要重复或虚构信息

严格按以下格式输出，不要输出其他任何内容：
TITLE: 翻译后的标题
SUMMARY_LEAD: 一句主旨
SUMMARY_POINT: 第一条要点
SUMMARY_POINT: 第二条要点`
	case "en":
		return `You are a translation and summarization assistant. Complete these two tasks:
1. Translate the title into English
2. Extract one concise lead and 2 to 4 short key points from the body, using no more than 100 words total; do not repeat points or invent facts

Output strictly in this format, nothing else:
TITLE: translated title
SUMMARY_LEAD: one-sentence lead
SUMMARY_POINT: first key point
SUMMARY_POINT: second key point`
	default:
		return fmt.Sprintf(`Translate the title and summarize the body in %s using no more than about 100 words total. Do not repeat points or invent facts.

Output strictly in this format, nothing else:
TITLE: translated title
SUMMARY_LEAD: one-sentence lead
SUMMARY_POINT: first key point
SUMMARY_POINT: second key point`, targetLang)
	}
}

func CombinedTitleSummaryUserMessage(title, content string) string {
	const maxChars = 8000
	if len(content) > maxChars {
		content = content[:maxChars]
	}
	return fmt.Sprintf("标题: %s\n\n正文: %s", title, content)
}
