package source

import (
	"bytes"
	"errors"
	"net/url"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

var ErrNoReadableContent = errors.New("source: page has no readable content")

type ReadableContent struct {
	Title       string
	ContentHTML string
	ContentText string
}

var readableBoilerplateSelectors = strings.Join([]string{
	"script", "style", "noscript", "svg", "iframe", "form",
	"nav", "header", "footer", "aside",
	".author-info", ".author-bio", ".author-card", ".post-author",
	".share-buttons", ".social-share", ".sharing", ".share-bar",
	".related-posts", ".related-articles", ".recommended",
	".comments", ".comment-section", "#comments", "#disqus_thread",
	".sidebar", ".widget", ".ad", ".advertisement", ".banner",
	".newsletter", ".subscribe-form", ".cta",
	".breadcrumb", ".breadcrumbs", ".pagination",
	".post-meta-bottom", ".post-footer", ".entry-footer", ".article-footer",
	".post-tags", ".tag-list",
	"[role='complementary']", "[role='navigation']", "[role='banner']",
}, ", ")

func ExtractReadableContent(body []byte, baseURL *url.URL) (ReadableContent, error) {
	doc, err := goquery.NewDocumentFromReader(bytes.NewReader(body))
	if err != nil {
		return ReadableContent{}, err
	}

	title := strings.TrimSpace(doc.Find("title").First().Text())
	doc.Find(readableBoilerplateSelectors).Remove()

	container := bestReadableContainer(doc)
	container.Find(readableBoilerplateSelectors).Remove()
	removeReadableBoilerplateByAttr(container)
	normalizeReadableImages(container, baseURL)
	stripReadablePresentationAttrs(container)
	container.Find("a").Each(func(_ int, sel *goquery.Selection) {
		sel.RemoveAttr("href")
	})

	html, err := container.Html()
	if err != nil {
		return ReadableContent{}, err
	}
	html = SanitizeHTML(html)
	text := strings.Join(strings.Fields(container.Text()), " ")
	if len([]rune(text)) < 80 {
		return ReadableContent{}, ErrNoReadableContent
	}

	return ReadableContent{Title: title, ContentHTML: html, ContentText: text}, nil
}

func bestReadableContainer(doc *goquery.Document) *goquery.Selection {
	candidates := []string{
		"article .content", "article .post-body", "article .article-body", "article .entry-content",
		".post-content", ".entry-content", ".article-content", ".article-body", ".post-body",
		"article", "main article", "main", "[role='main']", "[itemprop='articleBody']", ".content",
	}

	var best *goquery.Selection
	bestScore := 0
	for _, selector := range candidates {
		doc.Find(selector).EachWithBreak(func(_ int, sel *goquery.Selection) bool {
			score := readableScore(sel)
			if score > bestScore {
				best = sel
				bestScore = score
			}
			return true
		})
	}
	if best != nil && bestScore >= 80 {
		return best
	}
	return doc.Find("body").First()
}

var readableBoilerplateAttrPatterns = []string{
	"author", "share", "social", "comment", "related", "sidebar", "widget", "footer", "nav",
	"breadcrumb", "subscribe", "newsletter", "recommend", "ad-", "follow", "tag-list", "post-meta",
}

func removeReadableBoilerplateByAttr(container *goquery.Selection) {
	container.Find("div, section, span").Each(func(_ int, sel *goquery.Selection) {
		class, _ := sel.Attr("class")
		id, _ := sel.Attr("id")
		combined := strings.ToLower(class + " " + id)
		for _, pattern := range readableBoilerplateAttrPatterns {
			if strings.Contains(combined, pattern) {
				sel.Remove()
				return
			}
		}
	})
}

func normalizeReadableImages(container *goquery.Selection, baseURL *url.URL) {
	container.Find("img").Each(func(_ int, image *goquery.Selection) {
		src, _ := image.Attr("src")
		resolved := resolveReadableURL(baseURL, src)
		if resolved == "" {
			for _, attr := range []string{"data-src", "data-original", "data-lazy-src"} {
				if candidate, ok := image.Attr(attr); ok && strings.TrimSpace(candidate) != "" {
					if resolved = resolveReadableURL(baseURL, candidate); resolved != "" {
						break
					}
				}
			}
		}
		if resolved != "" {
			image.SetAttr("src", resolved)
		} else {
			image.RemoveAttr("src")
		}
		for _, attr := range []string{"srcset", "data-src", "data-original", "data-lazy-src"} {
			image.RemoveAttr(attr)
		}
	})
}

func hasUsableReadableImage(contentHTML string) bool {
	doc, err := goquery.NewDocumentFromReader(strings.NewReader(contentHTML))
	if err != nil {
		return false
	}
	found := false
	doc.Find("img").EachWithBreak(func(_ int, image *goquery.Selection) bool {
		src, _ := image.Attr("src")
		parsed, err := url.Parse(strings.TrimSpace(src))
		if err == nil && parsed.Hostname() != "" && (parsed.Scheme == "http" || parsed.Scheme == "https") {
			found = true
			return false
		}
		return true
	})
	return found
}

func resolveReadableURL(baseURL *url.URL, raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.String() == "" {
		return ""
	}
	if baseURL != nil {
		parsed = baseURL.ResolveReference(parsed)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}
	return parsed.String()
}

func stripReadablePresentationAttrs(container *goquery.Selection) {
	container.Find("*").Each(func(_ int, sel *goquery.Selection) {
		sel.RemoveAttr("class")
		sel.RemoveAttr("style")
		sel.RemoveAttr("id")
	})
}

func readableScore(sel *goquery.Selection) int {
	textLen := len([]rune(strings.Join(strings.Fields(sel.Text()), " ")))
	blockCount := sel.Find("p, li, blockquote, pre, h1, h2, h3").Length()
	return textLen + blockCount*60
}
