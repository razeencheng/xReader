package ai

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/db/gen"
	"github.com/razeencheng/xreader/internal/testutil"
	"github.com/stretchr/testify/require"
)

type scriptedBatchClient struct {
	responses []ChatResponse
	calls     int
}

func (c *scriptedBatchClient) ChatCompletion(_ context.Context, _ ChatRequest) (ChatResponse, error) {
	response := c.responses[c.calls]
	c.calls++
	return response, nil
}

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

func TestParseParagraphTranslations_PreservesYearPrefixesInUnnumberedLines(t *testing.T) {
	results := ParseParagraphTranslations(
		[]Paragraph{{Index: 0, Original: "First"}, {Index: 1, Original: "Second"}},
		"2026. 年度互联网中断回顾\n第二段翻译",
	)

	require.Len(t, results, 2)
	require.Equal(t, "2026. 年度互联网中断回顾", results[0].Translation)
	require.Equal(t, "第二段翻译", results[1].Translation)
}

func TestParseParagraphTranslations_AcceptsOrdinalLabelsForRequestedRange(t *testing.T) {
	results := ParseParagraphTranslations(
		[]Paragraph{{Index: 5, Original: "First"}, {Index: 6, Original: "Second"}},
		"1. 第一段翻译\n2. 第二段翻译",
	)

	require.Len(t, results, 2)
	require.Equal(t, "第一段翻译", results[0].Translation)
	require.Equal(t, "第二段翻译", results[1].Translation)
}

func TestParseParagraphTranslations_AcceptsMultipleLabelsOnOneLine(t *testing.T) {
	batch := []Paragraph{
		{Index: 0, Original: "First"},
		{Index: 1, Original: "Second"},
		{Index: 2, Original: "Heading"},
	}
	client := &scriptedBatchClient{responses: []ChatResponse{
		{Content: "[0] 第一段翻译 [1] 第二段翻译 [2] 标题翻译"},
		{Content: "[0] 第一段翻译"},
		{Content: "[1] 第二段翻译"},
		{Content: "[2] 标题翻译"},
	}}

	results, err := TranslateParagraphBatch(context.Background(), client, batch, "zh-CN")

	require.NoError(t, err)
	require.Len(t, results, 3)
	require.Equal(t, "第一段翻译", results[0].Translation)
	require.Equal(t, "第二段翻译", results[1].Translation)
	require.Equal(t, "标题翻译", results[2].Translation)
	require.Equal(t, 4, client.calls)
}

func TestParseParagraphTranslations_DoesNotTreatInlineCitationAsNextLabel(t *testing.T) {
	results := ParseParagraphTranslations(
		[]Paragraph{{Index: 0, Original: "First"}, {Index: 1, Original: "Second"}},
		"[0] 参见文献 [1] 的结论",
	)

	require.Nil(t, results)
}

func TestTranslateParagraphBatch_RetriesUnlabelledMultiParagraphResponseAsSingletons(t *testing.T) {
	client := &scriptedBatchClient{responses: []ChatResponse{
		{Content: "第一段翻译\n第二段翻译"},
		{Content: "[0] 第一段翻译"},
		{Content: "[1] 第二段翻译"},
	}}

	results, err := TranslateParagraphBatch(context.Background(), client, []Paragraph{
		{Index: 0, Original: "First"},
		{Index: 1, Original: "Second"},
	}, "zh-CN")

	require.NoError(t, err)
	require.Equal(t, []TranslatedParagraph{
		{Index: 0, Original: "First", Translation: "第一段翻译"},
		{Index: 1, Original: "Second", Translation: "第二段翻译"},
	}, results)
	require.Equal(t, 3, client.calls)
}

func TestTranslateParagraphBatch_DoesNotRetryTransportErrorsPerParagraph(t *testing.T) {
	transportErr := errors.New("rate limited")
	client := &MockClient{Err: transportErr}

	_, err := TranslateParagraphBatch(context.Background(), client, []Paragraph{
		{Index: 0, Original: "First"},
		{Index: 1, Original: "Second"},
	}, "zh-CN")

	require.ErrorIs(t, err, transportErr)
	require.Len(t, client.Calls, 1)
}

func TestParseParagraphTranslations_RejectsIncompleteNumberedResponse(t *testing.T) {
	results := ParseParagraphTranslations(
		[]Paragraph{
			{Index: 0, Original: "First"},
			{Index: 1, Original: "Second"},
		},
		"[0] 第一段翻译",
	)

	require.Nil(t, results)
}

func TestParseParagraphTranslations_RejectsExtraNumberedResponse(t *testing.T) {
	results := ParseParagraphTranslations(
		[]Paragraph{
			{Index: 0, Original: "First"},
			{Index: 1, Original: "Second"},
		},
		"[0] 第一段翻译 [1] 第二段翻译 [2] 多余翻译",
	)

	require.Nil(t, results)
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
