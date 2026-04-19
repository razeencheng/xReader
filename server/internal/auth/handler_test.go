package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupTestRouter(svc *Service) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewHandler(svc, nil)
	r.GET("/api/auth/github", h.BeginLogin)
	r.GET("/api/auth/callback/github", h.HandleCallback)
	return r
}

func TestHandler_BeginLogin_RedirectsToGitHub(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 1, Username: "test"},
		[]string{"test"},
	)
	r := setupTestRouter(svc)

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/github", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTemporaryRedirect, w.Code)
	loc := w.Header().Get("Location")
	require.Contains(t, loc, "github.com/login/oauth/authorize")
}

func TestHandler_Callback_HappyPath_SetsCookie(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 456, Username: "alice"},
		[]string{"alice"},
	)
	// Pre-populate state store with known state
	_ = svc.States.Save(nil, "test-state")

	r := setupTestRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback/github?state=test-state&code=test-code", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTemporaryRedirect, w.Code)
	cookies := w.Result().Cookies()
	require.Len(t, cookies, 1)
	assert.Equal(t, "xreader_session", cookies[0].Name)
	assert.Equal(t, "session-123", cookies[0].Value)
}

func TestHandler_Callback_DeniedUser_Returns403(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 123, Username: "stranger"},
		[]string{"alice"},
	)
	_ = svc.States.Save(nil, "test-state")

	r := setupTestRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback/github?state=test-state&code=test-code", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestHandler_Callback_BadState_Returns400(t *testing.T) {
	svc := newTestService(
		&GitHubUser{GitHubID: 123, Username: "alice"},
		[]string{"alice"},
	)

	r := setupTestRouter(svc)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/auth/callback/github?state=wrong&code=test-code", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}
