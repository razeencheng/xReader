package article

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/middleware"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/require"
)

func setupArticleHandlerTest(t *testing.T) (*gin.Engine, *ArticleHandler, *gen.Queries, *pgxpool.Pool, int64, int64, func()) {
	t.Helper()
	ctx := context.Background()
	pool, cleanup := testutil.SetupTestDB(t, ctx)

	var userID int64
	err := pool.QueryRow(ctx, "INSERT INTO users (github_id, github_username, role) VALUES ($1, $2, $3) RETURNING id", 1, "testuser", "user").Scan(&userID)
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

	gin.SetMode(gin.TestMode)
	r := gin.New()
	return r, NewArticleHandler(NewArticleService(pool)), queries, pool, userID, source.ID, cleanup
}

func withArticleUser(userID int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("user", &middleware.User{ID: userID, GitHubUsername: "testuser", Role: "user"})
		c.Next()
	}
}

func insertHandlerArticle(t *testing.T, queries *gen.Queries, ctx context.Context, sourceID int64, title string, publishedAt time.Time) gen.Article {
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
		Author:         pgtype.Text{String: "author", Valid: true},
		PublishedAt:    pgtype.Timestamptz{Time: publishedAt.UTC(), Valid: true},
		FetchedAt:      pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
	require.NoError(t, err)
	return article
}

func TestArticleHandler_ListAndDetail(t *testing.T) {
	r, handler, queries, pool, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "hello world", time.Now())
	require.NoError(t, gen.New(pool).SetArticleRead(ctx, gen.SetArticleReadParams{UserID: userID, ArticleID: article.ID, IsRead: true}))

	r.Use(withArticleUser(userID))
	r.GET("/api/articles", handler.List)
	r.GET("/api/articles/:id", handler.GetByID)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/articles?tab=today", nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var listResp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &listResp))
	items := listResp["items"].([]any)
	require.Len(t, items, 1)
	item := items[0].(map[string]any)
	require.Equal(t, "hello world", item["title"])
	require.NotContains(t, item, "content_html")

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", fmt.Sprintf("/api/articles/%d", article.ID), nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var detailResp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &detailResp))
	require.Equal(t, float64(article.ID), detailResp["id"])
	require.Equal(t, true, detailResp["is_read"])
	require.Equal(t, false, detailResp["is_starred"])
	require.Equal(t, "<p>hello world</p>", detailResp["content_html"])
}

func TestArticleHandler_LoadOriginalUsesArticleLink(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "summary-only", time.Now())
	handler.Service.originalLoader = func(_ context.Context, rawURL string) (OriginalContent, error) {
		require.Equal(t, article.Link, rawURL)
		return OriginalContent{
			URL:         rawURL,
			Title:       "Original title",
			ContentHTML: "<p>Full original paragraph with enough readable text.</p>",
			ContentText: "Full original paragraph with enough readable text.",
		}, nil
	}

	r.Use(withArticleUser(userID))
	r.POST("/api/articles/:id/original", handler.LoadOriginal)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", fmt.Sprintf("/api/articles/%d/original", article.ID), nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	require.Equal(t, article.Link, resp["url"])
	require.Equal(t, "Original title", resp["title"])
	require.Equal(t, "<p>Full original paragraph with enough readable text.</p>", resp["content_html"])
}

func TestImageProxyHandler_ProxiesImage(t *testing.T) {
	r, _, _, _, userID, _, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)

	handler := NewImageProxyHandler()
	handler.fetchImage = func(_ context.Context, rawURL string) (ProxiedImage, error) {
		require.Equal(t, "https://example.com/image.jpg", rawURL)
		return ProxiedImage{
			ContentType: "image/jpeg",
			Body:        []byte("image-bytes"),
		}, nil
	}

	r.Use(withArticleUser(userID))
	r.GET("/api/images/proxy", handler.Proxy)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/images/proxy?url=https%3A%2F%2Fexample.com%2Fimage.jpg", nil)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "image/jpeg", w.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=86400", w.Header().Get("Cache-Control"))
	require.Equal(t, "image-bytes", w.Body.String())
}

func TestNormalizeProxiedImageContentType_AllowsSniffedWebPFromOctetStream(t *testing.T) {
	webpHeader := []byte{
		'R', 'I', 'F', 'F',
		0x1a, 0x00, 0x00, 0x00,
		'W', 'E', 'B', 'P',
		'V', 'P', '8', ' ',
	}

	contentType, err := normalizeProxiedImageContentType("application/octet-stream", webpHeader)

	require.NoError(t, err)
	require.Equal(t, "image/webp", contentType)
}

func TestImageProxyHandler_RejectsMissingURL(t *testing.T) {
	r, _, _, _, userID, _, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)

	handler := NewImageProxyHandler()
	handler.fetchImage = func(context.Context, string) (ProxiedImage, error) {
		t.Fatal("fetchImage should not be called without a url")
		return ProxiedImage{}, nil
	}

	r.Use(withArticleUser(userID))
	r.GET("/api/images/proxy", handler.Proxy)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/images/proxy", nil)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusBadRequest, w.Code)
}

func TestArticleService_LoadOriginalPersistsContent(t *testing.T) {
	_, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "summary-persist", time.Now())
	handler.Service.originalLoader = func(_ context.Context, rawURL string) (OriginalContent, error) {
		require.Equal(t, article.Link, rawURL)
		return OriginalContent{
			URL:         rawURL,
			Title:       "Original title",
			ContentHTML: "<p>Persisted full original content with enough readable text.</p><p>Another paragraph.</p>",
			ContentText: "Persisted full original content with enough readable text. Another paragraph.",
		}, nil
	}

	_, err := handler.Service.LoadOriginal(ctx, userID, article.ID)
	require.NoError(t, err)

	updated, err := queries.GetArticleByID(ctx, article.ID)
	require.NoError(t, err)
	require.Equal(t, "<p>Persisted full original content with enough readable text.</p><p>Another paragraph.</p>", updated.ContentHtml)
	require.Equal(t, "Persisted full original content with enough readable text. Another paragraph.", updated.ContentText)
}

func TestArticleHandler_UpdateStateAndProgress(t *testing.T) {
	r, handler, queries, pool, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "state", time.Now())

	r.Use(withArticleUser(userID))
	r.PATCH("/api/articles/:id/state", handler.UpdateState)
	r.PUT("/api/articles/:id/progress", handler.UpdateProgress)

	payload, _ := json.Marshal(map[string]bool{"is_read": true, "is_starred": true})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("PATCH", fmt.Sprintf("/api/articles/%d/state", article.ID), bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	state, err := gen.New(pool).GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: article.ID})
	require.NoError(t, err)
	require.True(t, state.IsRead)
	require.True(t, state.IsStarred)

	progressBody, _ := json.Marshal(map[string]any{"scroll_percent": 12.5, "paragraph_index": 3, "updated_at": time.Now().UTC().Format(time.RFC3339Nano)})
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("PUT", fmt.Sprintf("/api/articles/%d/progress", article.ID), bytes.NewReader(progressBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)
}

func TestArticleHandler_BatchAndChanges(t *testing.T) {
	r, handler, queries, pool, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "batch", time.Now())
	changeArticle := insertHandlerArticle(t, queries, ctx, sourceID, "changes", time.Now())
	before := time.Now().Add(-time.Second)

	r.Use(withArticleUser(userID))
	r.POST("/api/articles/batch/state", handler.BatchState)
	r.PATCH("/api/articles/:id/state", handler.UpdateState)
	r.GET("/api/articles/changes", handler.Changes)

	body, _ := json.Marshal(map[string]any{"scope": "tab:today", "is_read": true})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/articles/batch/state", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	state, err := gen.New(pool).GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: article.ID})
	require.NoError(t, err)
	require.True(t, state.IsRead)

	stateBody, _ := json.Marshal(map[string]bool{"is_read": true})
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("PATCH", fmt.Sprintf("/api/articles/%d/state", changeArticle.ID), bytes.NewReader(stateBody))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/articles/changes?since="+before.UTC().Format(time.RFC3339Nano), nil)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	var changesResp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &changesResp))
	items := changesResp["items"].([]any)
	require.NotEmpty(t, items)
}

func TestArticleHandler_BatchCanUndoSourceReadState(t *testing.T) {
	r, handler, queries, pool, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()

	article := insertHandlerArticle(t, queries, ctx, sourceID, "batch-undo", time.Now())

	r.Use(withArticleUser(userID))
	r.POST("/api/articles/batch/state", handler.BatchState)

	body, _ := json.Marshal(map[string]any{"scope": fmt.Sprintf("source:%d", sourceID), "is_read": true})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/articles/batch/state", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	body, _ = json.Marshal(map[string]any{"scope": fmt.Sprintf("source:%d", sourceID), "is_read": false})
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/articles/batch/state", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	state, err := gen.New(pool).GetArticleState(ctx, gen.GetArticleStateParams{UserID: userID, ArticleID: article.ID})
	require.NoError(t, err)
	require.False(t, state.IsRead)
}
