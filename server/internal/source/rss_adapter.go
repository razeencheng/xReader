package source

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/mmcdole/gofeed"
	"github.com/razeencheng/xreader/internal/safenet"
)

const feedMaxResponseBytes = 10 * 1024 * 1024 // 10 MB
const articleImageRecoveryMaxBytes = 2 * 1024 * 1024
const articleImageRecoveryBudget = 20 * time.Second
const unsupportedImageBlockMarker = "unsupported block: image"

type RSSAdapter struct {
	parser     *gofeed.Parser
	safeClient *http.Client
}

// NewRSSAdapter creates an RSS adapter with SSRF-safe HTTP client.
// An optional *http.Client may be provided (for testing); if nil, a safe
// client that blocks private/reserved IP addresses is used.
func NewRSSAdapter(opts ...func(*RSSAdapter)) *RSSAdapter {
	client := safenet.NewClient(safenet.Options{
		Timeout:          15 * time.Second,
		DialTimeout:      5 * time.Second,
		MaxRedirects:     5,
		MaxResponseBytes: feedMaxResponseBytes,
		UserAgent:        "xReader feed fetcher",
	})

	p := gofeed.NewParser()
	p.Client = client
	p.UserAgent = "xReader feed fetcher"

	a := &RSSAdapter{parser: p, safeClient: client}
	for _, o := range opts {
		o(a)
	}
	return a
}

// WithHTTPClient overrides the default SSRF-safe client (for testing only).
func WithHTTPClient(c *http.Client) func(*RSSAdapter) {
	return func(a *RSSAdapter) {
		a.parser.Client = c
		a.safeClient = c
	}
}

func (a *RSSAdapter) Kind() string { return "rss" }

func (a *RSSAdapter) Fetch(ctx context.Context, src Source) ([]RawItem, error) {
	feed, err := a.parser.ParseURLWithContext(src.URL, ctx)
	if err != nil {
		return nil, fmt.Errorf("parse feed: %w", err)
	}

	recoveryCtx, cancelRecovery := context.WithTimeout(ctx, articleImageRecoveryBudget)
	defer cancelRecovery()
	items := make([]RawItem, 0, len(feed.Items))
	for _, item := range feed.Items {
		rawContent := bestContent(item)
		contentHTML := SanitizeHTML(rawContent)
		contentHTML = a.recoverDroppedImages(recoveryCtx, item.Link, rawContent, contentHTML)
		contentHTML = preserveItemArtwork(contentHTML, item, feed.Image)
		ri := RawItem{
			ExternalID:  item.GUID,
			Link:        item.Link,
			Title:       item.Title,
			ContentHTML: contentHTML,
		}
		if item.PublishedParsed != nil {
			ri.PublishedAt = *item.PublishedParsed
		} else {
			ri.PublishedAt = time.Now()
		}
		if feed.Language != "" {
			ri.LanguageHint = feed.Language
		}
		items = append(items, ri)
	}
	return items, nil
}

func (a *RSSAdapter) recoverDroppedImages(ctx context.Context, articleURL, rawContent, fallbackHTML string) string {
	if !strings.Contains(strings.ToLower(rawContent), unsupportedImageBlockMarker) {
		return fallbackHTML
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, articleURL, nil)
	if err != nil {
		return fallbackHTML
	}
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "xReader article image recovery")

	resp, err := a.safeClient.Do(req)
	if err != nil {
		return fallbackHTML
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !isHTMLResponse(resp.Header.Get("Content-Type")) {
		return fallbackHTML
	}

	body, err := safenet.ReadLimited(resp.Body, articleImageRecoveryMaxBytes)
	if err != nil {
		return fallbackHTML
	}
	baseURL := req.URL
	if resp.Request != nil && resp.Request.URL != nil {
		baseURL = resp.Request.URL
	}
	content, err := ExtractReadableContent(body, baseURL)
	if err != nil || !hasUsableReadableImage(content.ContentHTML) {
		return fallbackHTML
	}
	return content.ContentHTML
}

func isHTMLResponse(contentType string) bool {
	mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	return mediaType == "text/html" || mediaType == "application/xhtml+xml"
}

func preserveItemArtwork(contentHTML string, item *gofeed.Item, feedImage *gofeed.Image) string {
	if item == nil || strings.Contains(strings.ToLower(contentHTML), "<img") {
		return contentHTML
	}

	image := item.Image
	if image == nil {
		image = feedImage
	}
	if image == nil {
		return contentHTML
	}

	imageURL := strings.TrimSpace(image.URL)
	if imageURL == "" || safenet.ValidateURL(imageURL) != nil {
		return contentHTML
	}

	figure := fmt.Sprintf(`<figure><img src="%s" alt="%s"></figure>`,
		html.EscapeString(imageURL), html.EscapeString(strings.TrimSpace(item.Title)))
	return SanitizeHTML(figure + contentHTML)
}

func (a *RSSAdapter) Validate(ctx context.Context, url string) (SourceMetadata, error) {
	feed, err := a.parser.ParseURLWithContext(url, ctx)
	if err != nil {
		return SourceMetadata{}, fmt.Errorf("validate feed: %w", err)
	}
	meta := SourceMetadata{
		Title:        feed.Title,
		LanguageHint: feed.Language,
	}
	if feed.Image != nil {
		meta.IconURL = feed.Image.URL
	}
	return meta, nil
}

func bestContent(item *gofeed.Item) string {
	if item.Content != "" {
		return item.Content
	}
	return item.Description
}
