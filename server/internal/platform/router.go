package platform

import (
	"context"
	"io/fs"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/internal/admin"
	"github.com/razeencheng/xreader/internal/ai"
	"github.com/razeencheng/xreader/internal/article"
	"github.com/razeencheng/xreader/internal/auth"
	"github.com/razeencheng/xreader/internal/fever"
	"github.com/razeencheng/xreader/internal/highlight"
	"github.com/razeencheng/xreader/internal/middleware"
	"github.com/razeencheng/xreader/internal/setup"
	"github.com/razeencheng/xreader/internal/source"
	"github.com/razeencheng/xreader/internal/user"
)

type RouterDeps struct {
	Pool          *pgxpool.Pool
	SessionSecret string
	StaticFS      fs.FS
	SetupToken    string
}

func NewRouter(deps RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.SecurityHeaders())

	r.GET("/health", healthHandler)

	// Setup wizard routes (before auth middleware)
	setupH := setup.NewHandler(deps.Pool, deps.SetupToken)
	r.GET("/api/setup/status", setupH.Status)
	r.POST("/api/setup/complete", setupH.Complete)

	// Auth deps — OAuth config resolved dynamically on each request so
	// Setup Wizard changes take effect without a server restart.
	cfg := NewConfigResolver(deps.Pool)
	ghClient := auth.NewGitHubClient(func() auth.OAuthConfig {
		ctx := context.Background()
		return auth.OAuthConfig{
			ClientID:     cfg.Get(ctx, "GITHUB_CLIENT_ID", "github_client_id"),
			ClientSecret: cfg.GetEncryptedSecret(ctx, "GITHUB_CLIENT_SECRET", "github_client_secret"),
			CallbackURL:  cfg.Get(ctx, "GITHUB_CALLBACK_URL", "github_callback_url"),
		}
	})
	sessions := auth.NewPgSessionStore(deps.Pool)
	cookieState := auth.NewCookieState([]byte(deps.SessionSecret))
	allowSvc := admin.NewAllowlistService(deps.Pool)
	userStore := auth.NewPgUserStore(deps.Pool)

	authSvc := &auth.Service{
		GitHub:      ghClient,
		CookieState: cookieState,
		Allowlist:   allowSvc,
		Users:       userStore,
		Sessions:    sessions,
	}
	authH := auth.NewHandler(authSvc, sessions)
	aiSettings := ai.NewSettingsService(ai.NewPostgresSettingsRepository(deps.Pool))

	// Fever API (public — uses its own api_key auth, not session cookies)
	feverH := fever.NewHandler(deps.Pool)
	r.POST("/fever/", feverH.Handle)

	// Public auth routes
	r.GET("/api/auth/github", authH.BeginLogin)
	r.GET("/api/auth/callback", authH.HandleCallback)

	// Auth-protected routes
	authed := r.Group("/api")
	authed.Use(middleware.RequireAuth(sessions, deps.Pool))
	authed.Use(middleware.RequireCSRF())
	{
		// Auth
		authed.GET("/auth/me", authH.GetMe)
		authed.POST("/auth/logout", authH.Logout)

		// User preferences
		userH := user.NewHandler(deps.Pool)
		authed.GET("/users/me", userH.GetMe)
		authed.PATCH("/users/me", userH.UpdateMe)

		// Fever password setup (reuses feverH from above)
		authed.POST("/users/me/fever", feverH.SetFeverPassword)

		// Sources
		sourceSvc := source.NewSourceService(deps.Pool, source.NewRSSAdapter())
		sourceSvc.SetAIClient(ai.NewDynamicClient(aiSettings))
		sourceH := source.NewSourceHandler(sourceSvc, nil)
		authed.GET("/sources", sourceH.List)
		authed.POST("/sources", sourceH.Create)
		authed.PUT("/sources/:id", sourceH.Rename)
		authed.PATCH("/sources/:id/category", sourceH.UpdateCategory)
		authed.DELETE("/sources/:id", sourceH.Delete)
		authed.POST("/sources/:id/refresh", sourceH.Refresh)
		authed.POST("/sources/import", sourceH.ImportOPML)
		authed.GET("/sources/export", sourceH.ExportOPML)
		authed.GET("/sources/jobs/:jobID", sourceH.GetJob)

		// Articles
		articleSvc := article.NewArticleService(deps.Pool)
		articleH := article.NewArticleHandler(articleSvc)
		imageProxyH := article.NewImageProxyHandler()
		authed.GET("/articles", articleH.List)
		authed.GET("/articles/:id", articleH.GetByID)
		authed.POST("/articles/:id/original", articleH.LoadOriginal)
		authed.PATCH("/articles/:id/state", articleH.UpdateState)
		authed.PUT("/articles/:id/progress", articleH.UpdateProgress)
		authed.POST("/articles/batch/state", articleH.BatchState)
		authed.GET("/articles/changes", articleH.Changes)
		authed.GET("/images/proxy", imageProxyH.Proxy)

		// Article AI
		aiH := article.NewAIHandler(deps.Pool)
		authed.GET("/articles/:id/ai", aiH.GetArticleAI)
		// Article SSE + body retry
		sseH := article.NewSSEHandler(deps.Pool, ai.NewDynamicClient(aiSettings), 3)
		authed.GET("/articles/:id/body-translation", sseH.BodyTranslation)
		bodyRetryH := article.NewBodyRetryHandler(deps.Pool)
		authed.POST("/articles/:id/body-translation/retry", bodyRetryH.Retry)

		// Highlights
		highlightSvc := highlight.NewHighlightService(deps.Pool)
		highlightH := highlight.NewHighlightHandler(highlightSvc)
		authed.POST("/highlights", highlightH.Create)
		authed.GET("/highlights", highlightH.ListByUser)
		authed.GET("/articles/:id/highlights", highlightH.ListByArticle)
		authed.PUT("/highlights/:id/note", highlightH.UpdateNote)
		authed.DELETE("/highlights/:id", highlightH.Delete)

		// AI settings (GET is available to all authenticated users)
		aiSettingsH := ai.NewSettingsHandler(aiSettings)
		authed.GET("/ai/settings", aiSettingsH.Get)

		// Admin routes
		adminGroup := authed.Group("")
		adminGroup.Use(middleware.RequireAdmin())
		{
			allowH := admin.NewAllowlistHandler(allowSvc)
			adminGroup.GET("/admin/allowlist", allowH.List)
			adminGroup.POST("/admin/allowlist", allowH.Add)
			adminGroup.DELETE("/admin/allowlist/:username", allowH.Remove)

			adminGroup.PATCH("/ai/settings", aiSettingsH.Update)
		}
	}

	if deps.StaticFS != nil {
		subFS, _ := fs.Sub(deps.StaticFS, "static")
		r.NoRoute(gin.WrapH(NewSPAHandler(subFS)))
	}

	return r
}
