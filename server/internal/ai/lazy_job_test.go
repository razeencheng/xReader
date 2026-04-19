package ai

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/require"
)

func TestLazyJob_TranslatesAndPersists(t *testing.T) {
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)
	t.Cleanup(cleanup)

	userID := insertAIJobUser(t, ctx, pool)
	queries := gen.New(pool)
	src, err := queries.CreateSource(ctx, gen.CreateSourceParams{
		UserID:        userID,
		Kind:          "rss",
		Url:           "https://example.com/feed",
		NormalizedUrl: "https://example.com/feed",
		Title:         "Test Feed",
		Health:        "unknown",
	})
	require.NoError(t, err)

	article, err := queries.CreateArticle(ctx, gen.CreateArticleParams{
		SourceID:       src.ID,
		ExternalID:     "article-1",
		Link:           "https://example.com/post",
		NormalizedLink: "https://example.com/post",
		Title:          "Test Article",
		Language:       "en",
		ContentHtml:    "<p>First</p><p>Second</p>",
		ContentText:    "First Second",
		PublishedAt:    pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		FetchedAt:      pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	require.NoError(t, err)

	mock := &MockClient{Response: ChatResponse{Content: "[0] 第一段\n[1] 第二段"}}
	job := NewLazyJob(pool, mock, article.ID, "zh-CN", 2)

	require.NoError(t, job.Run(ctx))

	row, err := queries.GetArticleAI(ctx, gen.GetArticleAIParams{ArticleID: article.ID, TargetLanguage: "zh-CN"})
	require.NoError(t, err)
	require.Equal(t, "done", row.BodyTranslationStatus)

	var content []TranslatedParagraph
	require.NoError(t, json.Unmarshal(row.BodyTranslationContent, &content))
	require.Len(t, content, 2)
	require.Equal(t, "First", content[0].Original)
	require.Equal(t, "第一段", content[0].Translation)
	require.Equal(t, "Second", content[1].Original)
	require.Equal(t, "第二段", content[1].Translation)
}

func insertAIJobUser(t *testing.T, ctx context.Context, pool *pgxpool.Pool) int64 {
	t.Helper()
	var userID int64
	err := pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		1, "testuser", "user",
	).Scan(&userID)
	require.NoError(t, err)
	return userID
}
