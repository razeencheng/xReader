package source

import (
	"context"
	"fmt"
	"time"

	"github.com/mmcdole/gofeed"
)

type RSSAdapter struct {
	parser *gofeed.Parser
}

func NewRSSAdapter() *RSSAdapter {
	return &RSSAdapter{parser: gofeed.NewParser()}
}

func (a *RSSAdapter) Kind() string { return "rss" }

func (a *RSSAdapter) Fetch(ctx context.Context, src Source) ([]RawItem, error) {
	feed, err := a.parser.ParseURLWithContext(src.URL, ctx)
	if err != nil {
		return nil, fmt.Errorf("parse feed: %w", err)
	}

	items := make([]RawItem, 0, len(feed.Items))
	for _, item := range feed.Items {
		ri := RawItem{
			ExternalID:  item.GUID,
			Link:        item.Link,
			Title:       item.Title,
			ContentHTML: SanitizeHTML(bestContent(item)),
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
