package article

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestArticleListUsesStableCompositeCursorAcrossTabsAndSource(t *testing.T) {
	tests := []struct {
		name  string
		query string
		star  bool
	}{
		{name: "today", query: "tab=today"},
		{name: "stream", query: "tab=stream"},
		{name: "starred", query: "tab=starred", star: true},
		{name: "source", query: "tab=stream&source_id=%d"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
			t.Cleanup(cleanup)
			ctx := context.Background()
			publishedAt := time.Now().UTC().Truncate(time.Microsecond)
			articles := make([]int64, 0, 3)
			for i := 0; i < 3; i++ {
				article := insertHandlerArticle(t, queries, ctx, sourceID, fmt.Sprintf("same-time-%d", i), publishedAt)
				articles = append(articles, article.ID)
				if tt.star {
					_, err := handler.Service.SetStarredState(ctx, userID, article.ID, true)
					require.NoError(t, err)
				}
			}

			r.Use(withArticleUser(userID))
			r.GET("/api/articles", handler.List)
			query := tt.query
			if tt.name == "source" {
				query = fmt.Sprintf(query, sourceID)
			}
			first := requestArticlePage(t, r, query+"&limit=2")
			require.Len(t, first.Items, 2)
			require.NotEmpty(t, first.NextCursor)

			second := requestArticlePage(t, r, query+"&limit=2&cursor="+first.NextCursor)
			require.Len(t, second.Items, 1)
			require.Empty(t, second.NextCursor)

			got := []int64{first.Items[0].ID, first.Items[1].ID, second.Items[0].ID}
			require.ElementsMatch(t, articles, got)
		})
	}
}

func TestArticleListRestoresQueueAfterAnchorThatLeftUnreadFilter(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	base := time.Now().UTC()
	articles := make([]int64, 0, 4)
	for i := 0; i < 4; i++ {
		article := insertHandlerArticle(t, queries, ctx, sourceID, fmt.Sprintf("anchor-%d", i), base.Add(-time.Duration(i)*time.Minute))
		articles = append(articles, article.ID)
	}
	_, err := handler.Service.SetReadState(ctx, userID, articles[1], true)
	require.NoError(t, err)

	r.Use(withArticleUser(userID))
	r.GET("/api/articles", handler.List)
	page := requestArticlePage(t, r, fmt.Sprintf(
		"tab=stream&source_id=%d&filter=unread&after_article_id=%d&limit=2",
		sourceID, articles[1],
	))
	require.Len(t, page.Items, 2)
	require.Equal(t, []int64{articles[2], articles[3]}, []int64{page.Items[0].ID, page.Items[1].ID})
}

func TestArticleListUsesLookaheadAtPublicLimit(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	base := time.Now().UTC()
	for i := 0; i < 101; i++ {
		insertHandlerArticle(t, queries, ctx, sourceID, fmt.Sprintf("lookahead-%03d", i), base.Add(-time.Duration(i)*time.Second))
	}

	r.Use(withArticleUser(userID))
	r.GET("/api/articles", handler.List)
	page := requestArticlePage(t, r, "tab=today&limit=100")
	require.Len(t, page.Items, 100)
	require.NotEmpty(t, page.NextCursor)
}

func TestGuestArticleListUsesTheSameCompositeCursor(t *testing.T) {
	svc, queries, pool, contentOwnerID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	var guestID int64
	require.NoError(t, pool.QueryRow(ctx,
		"INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id",
		2, "guest-pagination", "guest",
	).Scan(&guestID))

	publishedAt := time.Now().UTC().Truncate(time.Microsecond)
	for i := 0; i < 3; i++ {
		insertArticleForTest(t, queries, ctx, sourceID, fmt.Sprintf("guest-same-time-%d", i), publishedAt)
	}
	first, err := svc.GuestListEnrichedPage(ctx, guestID, contentOwnerID, "today", nil, "zh-CN", "all", nil, 2)
	require.NoError(t, err)
	require.Len(t, first.Items, 2)
	require.NotEmpty(t, first.NextCursor)

	cursor, err := decodeArticleCursor(first.NextCursor, "today")
	require.NoError(t, err)
	second, err := svc.GuestListEnrichedPage(ctx, guestID, contentOwnerID, "today", nil, "zh-CN", "all", cursor, 2)
	require.NoError(t, err)
	require.Len(t, second.Items, 1)
	require.Empty(t, second.NextCursor)

	ids := []int64{first.Items[0].ID, first.Items[1].ID, second.Items[0].ID}
	require.Len(t, map[int64]struct{}{ids[0]: {}, ids[1]: {}, ids[2]: {}}, 3)
}

func requestArticlePage(t *testing.T, router http.Handler, query string) articleListResponse {
	t.Helper()
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/articles?"+query, nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var body articleListResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	return body
}

func TestArticleCursorRejectsWrongPrefix(t *testing.T) {
	_, err := decodeArticleCursor("sc1.bad", "stream")
	require.Error(t, err)
}

func TestArticleCursorAcceptsLegacyStreamTimestamp(t *testing.T) {
	when := time.Now().UTC().Truncate(time.Second)
	cursor, err := decodeArticleCursor(when.Format(time.RFC3339), "stream")
	require.NoError(t, err)
	require.Equal(t, when, cursor.PublishedAt)
	require.Equal(t, int64(-1<<63), cursor.ArticleID)
	require.Equal(t, strconv.FormatInt(cursor.ArticleID, 10), "-9223372036854775808")
}
