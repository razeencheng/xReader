package sync

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/source"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/require"
)

type mockAdapter struct {
	items    []source.RawItem
	fetchErr error
}

func (m *mockAdapter) Kind() string { return "rss" }

func (m *mockAdapter) Fetch(ctx context.Context, src source.Source) ([]source.RawItem, error) {
	if m.fetchErr != nil {
		return nil, m.fetchErr
	}
	return m.items, nil
}

func (m *mockAdapter) Validate(ctx context.Context, url string) (source.SourceMetadata, error) {
	return source.SourceMetadata{}, nil
}

func setupTestSource(t *testing.T, pool *pgxpool.Pool, ctx context.Context) gen.Source {
	t.Helper()
	queries := gen.New(pool)

	var userID int64
	err := pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		1, "testuser", "user",
	).Scan(&userID)
	require.NoError(t, err)

	src, err := queries.CreateSource(ctx, gen.CreateSourceParams{
		UserID:        userID,
		Kind:          "rss",
		Url:           "https://example.com/feed.xml",
		NormalizedUrl: "https://example.com/feed.xml",
		Title:         "Test Feed",
		Health:        "unknown",
	})
	require.NoError(t, err)
	return src
}

func TestFetchJob_DedupesByNormalizedLink(t *testing.T) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)
	t.Cleanup(cleanup)

	src := setupTestSource(t, pool, ctx)

	queries := gen.New(pool)
	_, err := queries.CreateArticle(ctx, gen.CreateArticleParams{
		SourceID:       src.ID,
		ExternalID:     "existing-1",
		Link:           "https://example.com/post1",
		NormalizedLink: "https://example.com/post1",
		Title:          "Existing Post",
		Language:       "en",
		ContentHtml:    "<p>existing</p>",
		ContentText:    "existing",
		PublishedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		FetchedAt:      pgtype.Timestamptz{Time: time.Now(), Valid: true},
	})
	require.NoError(t, err)

	adapter := &mockAdapter{
		items: []source.RawItem{
			{ExternalID: "existing-1", Link: "https://example.com/post1", Title: "Existing Post", ContentHTML: "<p>existing</p>", PublishedAt: time.Now()},
			{ExternalID: "new-2", Link: "https://example.com/post2", Title: "New Post 2", ContentHTML: "<p>new 2</p>", PublishedAt: time.Now()},
			{ExternalID: "new-3", Link: "https://example.com/post3", Title: "New Post 3", ContentHTML: "<p>new 3</p>", PublishedAt: time.Now()},
		},
	}

	job := NewFetchJob(pool, adapter)
	inserted, err := job.Run(ctx, src)
	require.NoError(t, err)
	require.Equal(t, 2, inserted)

	articles, err := queries.ListArticlesBySource(ctx, src.ID)
	require.NoError(t, err)
	require.Len(t, articles, 3)
}

func TestFetchJob_MarksFailureIncrementsCounter(t *testing.T) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)
	t.Cleanup(cleanup)

	src := setupTestSource(t, pool, ctx)

	adapter := &mockAdapter{fetchErr: fmt.Errorf("connection refused")}
	job := NewFetchJob(pool, adapter)
	_, err := job.Run(ctx, src)
	require.Error(t, err)

	queries := gen.New(pool)
	updated, err := queries.GetSourceByID(ctx, src.ID)
	require.NoError(t, err)
	require.Equal(t, int32(1), updated.ConsecutiveFails)
	require.Equal(t, "warn", updated.Health)
}

func TestFetchJob_SuccessResetsFailCounter(t *testing.T) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)
	t.Cleanup(cleanup)

	src := setupTestSource(t, pool, ctx)

	queries := gen.New(pool)
	err := queries.UpdateSourceFetchStatus(ctx, gen.UpdateSourceFetchStatusParams{
		ID:               src.ID,
		LastFetchedAt:    pgtype.Timestamptz{Time: time.Now().Add(-2 * time.Hour), Valid: true},
		LastSuccessAt:    pgtype.Timestamptz{},
		ConsecutiveFails: 3,
		Health:           "warn",
	})
	require.NoError(t, err)

	adapter := &mockAdapter{
		items: []source.RawItem{
			{ExternalID: "1", Link: "https://example.com/p1", Title: "Post", ContentHTML: "<p>hi</p>", PublishedAt: time.Now()},
		},
	}
	job := NewFetchJob(pool, adapter)
	inserted, err := job.Run(ctx, src)
	require.NoError(t, err)
	require.Equal(t, 1, inserted)

	updated, err := queries.GetSourceByID(ctx, src.ID)
	require.NoError(t, err)
	require.Equal(t, int32(0), updated.ConsecutiveFails)
	require.Equal(t, "ok", updated.Health)
}
