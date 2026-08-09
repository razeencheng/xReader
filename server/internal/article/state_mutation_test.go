package article

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestStateMutationsReturnStrictlyIncreasingVersions(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	article := insertArticleForTest(t, queries, ctx, sourceID, "versioned", time.Now())

	first, err := svc.SetReadState(ctx, userID, article.ID, true)
	require.NoError(t, err)
	second, err := svc.SetReadState(ctx, userID, article.ID, false)
	require.NoError(t, err)

	require.True(t, first.IsRead)
	require.False(t, second.IsRead)
	require.NotNil(t, first.StateVersion)
	require.NotNil(t, second.StateVersion)
	firstMicros, err := strconv.ParseInt(first.StateVersion.ChangedAtMicros, 10, 64)
	require.NoError(t, err)
	secondMicros, err := strconv.ParseInt(second.StateVersion.ChangedAtMicros, 10, 64)
	require.NoError(t, err)
	require.Greater(t, secondMicros, firstMicros)
	require.Equal(t, article.ID, second.StateVersion.ArticleID)
}

func TestConcurrentStateMutationsHaveUniqueOrderedVersions(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	article := insertArticleForTest(t, queries, ctx, sourceID, "concurrent-versioned", time.Now())

	const workers = 8
	versions := make(chan int64, workers)
	errors := make(chan error, workers)
	var group sync.WaitGroup
	for i := 0; i < workers; i++ {
		group.Add(1)
		go func(isRead bool) {
			defer group.Done()
			snapshot, err := svc.SetReadState(ctx, userID, article.ID, isRead)
			if err != nil {
				errors <- err
				return
			}
			micros, err := strconv.ParseInt(snapshot.StateVersion.ChangedAtMicros, 10, 64)
			if err != nil {
				errors <- err
				return
			}
			versions <- micros
		}(i%2 == 0)
	}
	group.Wait()
	close(errors)
	close(versions)
	for err := range errors {
		require.NoError(t, err)
	}

	seen := make(map[int64]struct{}, workers)
	var maxVersion int64
	for version := range versions {
		seen[version] = struct{}{}
		if version > maxVersion {
			maxVersion = version
		}
	}
	require.Len(t, seen, workers)
	current, err := svc.GetStateSnapshot(ctx, userID, article.ID)
	require.NoError(t, err)
	currentVersion, err := strconv.ParseInt(current.StateVersion.ChangedAtMicros, 10, 64)
	require.NoError(t, err)
	require.Equal(t, maxVersion, currentVersion)
}

func TestArticleStatePatchAndGetReturnAuthoritativeVersion(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	article := insertHandlerArticle(t, queries, context.Background(), sourceID, "authoritative", time.Now())

	r.Use(withArticleUser(userID))
	r.PATCH("/api/articles/:id/state", handler.UpdateState)
	r.GET("/api/articles/:id/state", handler.GetState)

	patchReq := httptest.NewRequest(http.MethodPatch, "/api/articles/"+strconv.FormatInt(article.ID, 10)+"/state", bytes.NewBufferString(`{"is_read":true}`))
	patchReq.Header.Set("Content-Type", "application/json")
	patchResp := httptest.NewRecorder()
	r.ServeHTTP(patchResp, patchReq)
	require.Equal(t, http.StatusOK, patchResp.Code, patchResp.Body.String())

	var patched articleStateResponse
	require.NoError(t, json.Unmarshal(patchResp.Body.Bytes(), &patched))
	require.True(t, patched.IsRead)
	require.NotNil(t, patched.StateVersion)

	getResp := httptest.NewRecorder()
	r.ServeHTTP(getResp, httptest.NewRequest(http.MethodGet, "/api/articles/"+strconv.FormatInt(article.ID, 10)+"/state", nil))
	require.Equal(t, http.StatusOK, getResp.Code, getResp.Body.String())

	var fetched articleStateResponse
	require.NoError(t, json.Unmarshal(getResp.Body.Bytes(), &fetched))
	require.Equal(t, patched, fetched)
}

func TestChangesBootstrapAndPagination(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	firstArticle := insertArticleForTest(t, queries, ctx, sourceID, "change-one", time.Now())
	secondArticle := insertArticleForTest(t, queries, ctx, sourceID, "change-two", time.Now().Add(-time.Second))

	_, err := svc.SetReadState(ctx, userID, firstArticle.ID, true)
	require.NoError(t, err)

	bootstrap, err := svc.ListStateChanges(ctx, userID, "", 1)
	require.NoError(t, err)
	require.Empty(t, bootstrap.Items)
	require.NotEmpty(t, bootstrap.NextCursor)
	require.False(t, bootstrap.HasMore)

	_, err = svc.SetReadState(ctx, userID, firstArticle.ID, false)
	require.NoError(t, err)
	_, err = svc.SetStarredState(ctx, userID, secondArticle.ID, true)
	require.NoError(t, err)

	pageOne, err := svc.ListStateChanges(ctx, userID, bootstrap.NextCursor, 1)
	require.NoError(t, err)
	require.Len(t, pageOne.Items, 1)
	require.True(t, pageOne.HasMore)

	pageTwo, err := svc.ListStateChanges(ctx, userID, pageOne.NextCursor, 1)
	require.NoError(t, err)
	require.Len(t, pageTwo.Items, 1)
	require.False(t, pageTwo.HasMore)
	require.NotEqual(t, pageOne.Items[0].ArticleID, pageTwo.Items[0].ArticleID)
}

func TestChangesHandlerBootstrapsWithoutClientClock(t *testing.T) {
	r, handler, _, _, userID, _, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	gin.SetMode(gin.TestMode)
	r.Use(withArticleUser(userID))
	r.GET("/api/articles/changes", handler.Changes)

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/articles/changes", nil))
	require.Equal(t, http.StatusOK, w.Code, w.Body.String())

	var body stateChangesResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Empty(t, body.Items)
	require.NotEmpty(t, body.NextCursor)
}

func TestBatchSetReadReturnsVersionedAuthoritativeStates(t *testing.T) {
	svc, queries, _, userID, sourceID, cleanup := setupArticleServiceTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	first := insertArticleForTest(t, queries, ctx, sourceID, "batch-one", time.Now())
	second := insertArticleForTest(t, queries, ctx, sourceID, "batch-two", time.Now().Add(-time.Second))

	states, err := svc.BatchSetReadStates(ctx, userID, "tab:stream", true)
	require.NoError(t, err)
	require.Len(t, states, 2)
	require.Equal(t, first.ID, states[0].ArticleID)
	require.Equal(t, second.ID, states[1].ArticleID)
	for _, state := range states {
		require.True(t, state.IsRead)
		require.NotNil(t, state.StateVersion)
	}
	require.Equal(t, states[0].StateVersion.ChangedAtMicros, states[1].StateVersion.ChangedAtMicros)
}

func TestListAndDetailIncludeStateVersion(t *testing.T) {
	r, handler, queries, _, userID, sourceID, cleanup := setupArticleHandlerTest(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	article := insertHandlerArticle(t, queries, ctx, sourceID, "versioned-response", time.Now())
	mutated, err := handler.Service.SetReadState(ctx, userID, article.ID, true)
	require.NoError(t, err)

	r.Use(withArticleUser(userID))
	r.GET("/api/articles", handler.List)
	r.GET("/api/articles/:id", handler.GetByID)

	listResp := httptest.NewRecorder()
	r.ServeHTTP(listResp, httptest.NewRequest(http.MethodGet, "/api/articles?tab=today", nil))
	require.Equal(t, http.StatusOK, listResp.Code, listResp.Body.String())
	var listBody articleListResponse
	require.NoError(t, json.Unmarshal(listResp.Body.Bytes(), &listBody))
	require.Len(t, listBody.Items, 1)
	require.Equal(t, mutated.StateVersion, listBody.Items[0].StateVersion)

	detailResp := httptest.NewRecorder()
	r.ServeHTTP(detailResp, httptest.NewRequest(http.MethodGet, "/api/articles/"+strconv.FormatInt(article.ID, 10), nil))
	require.Equal(t, http.StatusOK, detailResp.Code, detailResp.Body.String())
	var detailBody articleDetailResponse
	require.NoError(t, json.Unmarshal(detailResp.Body.Bytes(), &detailBody))
	require.Equal(t, mutated.StateVersion, detailBody.StateVersion)
}
