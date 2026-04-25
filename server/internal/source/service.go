package source

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
)

type SourceService struct {
	pool     *pgxpool.Pool
	queries  *gen.Queries
	adapters map[string]SourceAdapter
}

type SourceListItem struct {
	ID          int64   `json:"id"`
	Title       string  `json:"title"`
	Url         string  `json:"url"`
	Category    string  `json:"category"`
	IconURL     *string `json:"icon_url,omitempty"`
	UnreadCount int64   `json:"unread_count"`
}

func NewSourceService(pool *pgxpool.Pool, adapters ...SourceAdapter) *SourceService {
	m := make(map[string]SourceAdapter)
	for _, a := range adapters {
		m[a.Kind()] = a
	}
	return &SourceService{pool: pool, queries: gen.New(pool), adapters: m}
}

func (s *SourceService) List(ctx context.Context, userID int64) ([]SourceListItem, error) {
	sources, err := s.queries.ListSourcesByUser(ctx, userID)
	if err != nil {
		return nil, err
	}

	counts, err := s.listUnreadCounts(ctx, userID)
	if err != nil {
		return nil, err
	}

	items := make([]SourceListItem, 0, len(sources))
	for _, source := range sources {
		items = append(items, SourceListItem{
			ID:          source.ID,
			Title:       source.Title,
			Url:         source.Url,
			Category:    defaultCategory(source.Category),
			IconURL:     textPtr(source.IconUrl),
			UnreadCount: counts[source.ID],
		})
	}

	return items, nil
}

func (s *SourceService) Create(ctx context.Context, userID int64, rawURL string, category string) (gen.Source, error) {
	if category == "" {
		category = "General"
	}
	adapter, ok := s.adapters["rss"]
	if !ok {
		return gen.Source{}, fmt.Errorf("no adapter for kind rss")
	}

	discovered, err := discoverFeed(ctx, rawURL, adapter)
	if err != nil {
		return gen.Source{}, fmt.Errorf("discover feed: %w", err)
	}

	normalized, err := Normalize(discovered.URL)
	if err != nil {
		return gen.Source{}, fmt.Errorf("invalid URL: %w", err)
	}

	title := discovered.Metadata.Title
	if title == "" {
		title = discovered.URL
	}

	return s.queries.CreateSource(ctx, gen.CreateSourceParams{
		UserID:        userID,
		Kind:          "rss",
		Url:           discovered.URL,
		NormalizedUrl: normalized,
		Title:         title,
		IconUrl:       textOrNull(discovered.Metadata.IconURL),
		LanguageHint:  textOrNull(discovered.Metadata.LanguageHint),
		Health:        "unknown",
		Category:      category,
	})
}

func (s *SourceService) Rename(ctx context.Context, userID int64, sourceID int64, title string) error {
	src, err := s.queries.GetSourceByID(ctx, sourceID)
	if err != nil || src.UserID != userID {
		return fmt.Errorf("source not found")
	}
	return s.queries.UpdateSourceTitle(ctx, gen.UpdateSourceTitleParams{ID: sourceID, Title: title})
}

func (s *SourceService) UpdateCategory(ctx context.Context, userID int64, sourceID int64, category string) error {
	src, err := s.queries.GetSourceByID(ctx, sourceID)
	if err != nil || src.UserID != userID {
		return fmt.Errorf("source not found")
	}
	if category == "" {
		category = "General"
	}
	return s.queries.UpdateSourceCategory(ctx, gen.UpdateSourceCategoryParams{ID: sourceID, Category: category})
}

func (s *SourceService) Delete(ctx context.Context, userID int64, sourceID int64) error {
	src, err := s.queries.GetSourceByID(ctx, sourceID)
	if err != nil || src.UserID != userID {
		return fmt.Errorf("source not found")
	}
	return s.queries.SoftDeleteSource(ctx, sourceID)
}

func (s *SourceService) listUnreadCounts(ctx context.Context, userID int64) (map[int64]int64, error) {
	const query = `
		SELECT s.id, COUNT(a.id) FILTER (WHERE st.is_read IS NULL OR st.is_read = false) AS unread_count
		FROM sources s
		LEFT JOIN articles a ON a.source_id = s.id
		LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = $1
		WHERE s.user_id = $1 AND s.deleted_at IS NULL
		GROUP BY s.id
	`

	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[int64]int64)
	for rows.Next() {
		var sourceID int64
		var unreadCount int64
		if err := rows.Scan(&sourceID, &unreadCount); err != nil {
			return nil, err
		}
		counts[sourceID] = unreadCount
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return counts, nil
}

func textOrNull(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}

func textPtr(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}

	trimmed := strings.TrimSpace(value.String)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func defaultCategory(category string) string {
	trimmed := strings.TrimSpace(category)
	if trimmed == "" {
		return "General"
	}
	return trimmed
}
