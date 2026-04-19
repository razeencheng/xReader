package article

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/require"
)

func setupArticleServiceTest(t *testing.T) (*ArticleService, *gen.Queries, *pgxpool.Pool, int64, int64, func()) {
	t.Helper()
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)

	var userID int64
	err := pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		1, "testuser", "user",
	).Scan(&userID)
	require.NoError(t, err)

	queries := gen.New(pool)
	source, err := queries.CreateSource(ctx, gen.CreateSourceParams{
		UserID:        userID,
		Kind:          "rss",
		Url:           "https://example.com/feed.xml",
		NormalizedUrl: "https://example.com/feed.xml",
		Title:         "Test Feed",
		Health:        "unknown",
	})
	require.NoError(t, err)

	return NewArticleService(pool), queries, pool, userID, source.ID, cleanup
}

func insertArticleForTest(t *testing.T, queries *gen.Queries, ctx context.Context, sourceID int64, title string, publishedAt time.Time) gen.Article {
	t.Helper()
	article, err := queries.CreateArticle(ctx, gen.CreateArticleParams{
		SourceID:       sourceID,
		ExternalID:     title,
		Link:           fmt.Sprintf("https://example.com/%s", title),
		NormalizedLink: fmt.Sprintf("https://example.com/%s", title),
		Title:          title,
		Language:       "en",
		ContentHtml:    "<p>" + title + "</p>",
		ContentText:    title,
		PublishedAt:    pgtype.Timestamptz{Time: publishedAt.UTC(), Valid: true},
		FetchedAt:      pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	require.NoError(t, err)
	return article
}

func TestListToday(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	recent := insertArticleForTest(t, queries, ctx, sourceID, "recent", time.Now().Add(-2*time.Hour))
	insertArticleForTest(t, queries, ctx, sourceID, "old", time.Now().Add(-48*time.Hour))

	items, err := svc.ListToday(ctx, userID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, recent.ID, items[0].ID)
}

func TestListStream_CursorPagination(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	for i := range 5 {
		insertArticleForTest(t, queries, ctx, sourceID, fmt.Sprintf("post-%d", i), time.Now().Add(-time.Duration(i)*time.Minute))
	}

	items, err := svc.ListStream(ctx, userID, nil, 2)
	require.NoError(t, err)
	require.Len(t, items, 2)
	require.Equal(t, "post-0", items[0].Title)
	require.Equal(t, "post-1", items[1].Title)

	cursor := items[len(items)-1].PublishedAt.Time
	items2, err := svc.ListStream(ctx, userID, &cursor, 2)
	require.NoError(t, err)
	require.Len(t, items2, 2)
	require.Equal(t, "post-2", items2[0].Title)
	require.Equal(t, "post-3", items2[1].Title)
}

func TestListStarred(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertArticleForTest(t, queries, ctx, sourceID, "starred", time.Now())
	require.NoError(t, svc.SetStarred(ctx, userID, article.ID, true))

	items, err := svc.ListStarred(ctx, userID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, article.ID, items[0].ID)
}

func TestGetByID_OwnershipCheck(t *testing.T) {
	svc, queries, pool, userA, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	var otherUserID int64
	err := pool.QueryRow(ctx, "INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id", 2, "other", "user").Scan(&otherUserID)
	require.NoError(t, err)

	article := insertArticleForTest(t, queries, ctx, sourceID, "owned", time.Now())

	_, err = svc.GetByID(ctx, otherUserID, article.ID)
	require.Error(t, err)
	require.Contains(t, err.Error(), "not found")

	got, err := svc.GetByID(ctx, userA, article.ID)
	require.NoError(t, err)
	require.Equal(t, article.ID, got.ID)
}

func TestSetReadAndStarred(t *testing.T) {
	svc, queries, pool, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertArticleForTest(t, queries, ctx, sourceID, "stateful", time.Now())

	require.NoError(t, svc.SetRead(ctx, userID, article.ID, true))
	require.NoError(t, svc.SetStarred(ctx, userID, article.ID, true))

	state, err := gen.New(pool).GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: article.ID})
	require.NoError(t, err)
	require.True(t, state.IsRead)
	require.True(t, state.IsStarred)
}

func TestBatchMarkRead_Today(t *testing.T) {
	svc, queries, pool, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertArticleForTest(t, queries, ctx, sourceID, "today", time.Now().Add(-time.Hour))
	require.NoError(t, svc.BatchMarkRead(ctx, userID, "tab:today"))

	state, err := gen.New(pool).GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: article.ID})
	require.NoError(t, err)
	require.True(t, state.IsRead)
}

func TestSearch(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertArticleForTest(t, queries, ctx, sourceID, "postgresql search guide", time.Now())

	items, err := svc.Search(ctx, userID, "postgresql search")
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, article.ID, items[0].ID)
}

func TestListChanges(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertArticleForTest(t, queries, ctx, sourceID, "changes", time.Now())
	before := time.Now().Add(-time.Second)
	require.NoError(t, svc.SetRead(ctx, userID, article.ID, true))

	changes, err := svc.ListChanges(ctx, userID, before)
	require.NoError(t, err)
	require.Len(t, changes, 1)
	require.Equal(t, article.ID, changes[0].ArticleID)
}
