package article

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/ai"
	"github.com/stretchr/testify/require"
)

func TestSSE_ServesCachedTranslation(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)

	ctx := context.Background()
	article := insertHandlerArticle(t, queries, ctx, sourceID, "cached", time.Now())
	cached := []ai.TranslatedParagraph{{Index: 0, Original: "First", Translation: "第一段"}, {Index: 1, Original: "Second", Translation: "第二段"}}
	payload, err := json.Marshal(cached)
	require.NoError(t, err)
	require.NoError(t, queries.EnsureArticleAI(ctx, gen.EnsureArticleAIParams{ArticleID: article.ID, TargetLanguage: "zh-CN"}))
	require.NoError(t, queries.SetBodyTranslationContent(ctx, gen.SetBodyTranslationContentParams{ArticleID: article.ID, TargetLanguage: "zh-CN", BodyTranslationContent: payload}))

	r.Use(withArticleUser(userID))
	r.GET("/api/articles/:id/body-translation", handler.BodyTranslation)

	w := httptest.NewRecorder()
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/articles/%d/body-translation", article.ID), nil)
	require.NoError(t, err)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Header().Get("Content-Type"), "text/event-stream")
	require.Contains(t, w.Body.String(), `data: {"type":"paragraph","index":0,"original":"First","translation":"第一段"}`)
	require.Contains(t, w.Body.String(), `data: {"type":"paragraph","index":1,"original":"Second","translation":"第二段"}`)
	require.Contains(t, w.Body.String(), `data: {"type":"done"}`)
}

func TestSSE_StartsJobForNewRequest(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)

	ctx := context.Background()
	article := insertHandlerArticle(t, queries, ctx, sourceID, "new", time.Now())

	r.Use(withArticleUser(userID))
	r.GET("/api/articles/:id/body-translation", handler.BodyTranslation)

	w := httptest.NewRecorder()
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/articles/%d/body-translation", article.ID), nil)
	require.NoError(t, err)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusAccepted, w.Code)
	require.JSONEq(t, `{"status":"started"}`, w.Body.String())
}
