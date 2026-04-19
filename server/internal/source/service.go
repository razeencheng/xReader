package source

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
)

type SourceService struct {
	pool     *pgxpool.Pool
	queries  *gen.Queries
	adapters map[string]SourceAdapter
}

func NewSourceService(pool *pgxpool.Pool, adapters ...SourceAdapter) *SourceService {
	m := make(map[string]SourceAdapter)
	for _, a := range adapters {
		m[a.Kind()] = a
	}
	return &SourceService{pool: pool, queries: gen.New(pool), adapters: m}
}

func (s *SourceService) List(ctx context.Context, userID int64) ([]gen.Source, error) {
	return s.queries.ListSourcesByUser(ctx, userID)
}

func (s *SourceService) Create(ctx context.Context, userID int64, rawURL string) (gen.Source, error) {
	normalized, err := Normalize(rawURL)
	if err != nil {
		return gen.Source{}, fmt.Errorf("invalid URL: %w", err)
	}

	adapter, ok := s.adapters["rss"]
	if !ok {
		return gen.Source{}, fmt.Errorf("no adapter for kind rss")
	}

	meta, err := adapter.Validate(ctx, rawURL)
	if err != nil {
		return gen.Source{}, fmt.Errorf("validate feed: %w", err)
	}

	title := meta.Title
	if title == "" {
		title = rawURL
	}

	return s.queries.CreateSource(ctx, gen.CreateSourceParams{
		UserID:        userID,
		Kind:          "rss",
		Url:           rawURL,
		NormalizedUrl: normalized,
		Title:         title,
		IconUrl:       textOrNull(meta.IconURL),
		LanguageHint:  textOrNull(meta.LanguageHint),
		Health:        "unknown",
	})
}

func (s *SourceService) Rename(ctx context.Context, userID int64, sourceID int64, title string) error {
	src, err := s.queries.GetSourceByID(ctx, sourceID)
	if err != nil || src.UserID != userID {
		return fmt.Errorf("source not found")
	}
	return s.queries.UpdateSourceTitle(ctx, gen.UpdateSourceTitleParams{ID: sourceID, Title: title})
}

func (s *SourceService) Delete(ctx context.Context, userID int64, sourceID int64) error {
	src, err := s.queries.GetSourceByID(ctx, sourceID)
	if err != nil || src.UserID != userID {
		return fmt.Errorf("source not found")
	}
	return s.queries.SoftDeleteSource(ctx, sourceID)
}

func textOrNull(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: s, Valid: true}
}
