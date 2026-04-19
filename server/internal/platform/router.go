package platform

import (
	"os"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/admin"
	"github.com/jin/xreader-web/internal/article"
	"github.com/jin/xreader-web/internal/auth"
	"github.com/jin/xreader-web/internal/highlight"
	"github.com/jin/xreader-web/internal/middleware"
	"github.com/jin/xreader-web/internal/source"
	"github.com/jin/xreader-web/internal/user"
	"github.com/redis/go-redis/v9"
)

type RouterDeps struct {
	Pool  *pgxpool.Pool
	Redis *redis.Client
}

func NewRouter(deps RouterDeps) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())

	r.GET("/health", healthHandler)

	// Auth deps
	ghClient := auth.NewGitHubClient(
		os.Getenv("GITHUB_CLIENT_ID"),
		os.Getenv("GITHUB_CLIENT_SECRET"),
		os.Getenv("GITHUB_CALLBACK_URL"),
	)
	sessions := auth.NewRedisSessionStore(deps.Redis, deps.Pool)
	states := auth.NewRedisStateStore(deps.Redis)
	allowSvc := admin.NewAllowlistService(deps.Pool)
	userStore := auth.NewPgUserStore(deps.Pool)

	authSvc := &auth.Service{
		GitHub:    ghClient,
		States:    states,
		Allowlist: allowSvc,
		Users:     userStore,
		Sessions:  sessions,
	}
	authH := auth.NewHandler(authSvc, sessions)

	// Public auth routes
	r.GET("/api/auth/github", authH.BeginLogin)
	r.GET("/api/auth/callback", authH.HandleCallback)

	// Auth-protected routes
	authed := r.Group("/api")
	authed.Use(middleware.RequireAuth(sessions, deps.Pool))
	{
		// Auth
		authed.GET("/auth/me", authH.GetMe)
		authed.POST("/auth/logout", authH.Logout)

		// User preferences
		userH := user.NewHandler(deps.Pool)
		authed.PATCH("/users/me", userH.UpdatePreferences)

		// Sources
		sourceSvc := source.NewSourceService(deps.Pool)
		sourceH := source.NewSourceHandler(sourceSvc, nil)
		authed.GET("/sources", sourceH.List)
		authed.POST("/sources", sourceH.Create)
		authed.PUT("/sources/:id", sourceH.Rename)
		authed.DELETE("/sources/:id", sourceH.Delete)
		authed.POST("/sources/:id/refresh", sourceH.Refresh)
		authed.POST("/sources/import", sourceH.ImportOPML)
		authed.GET("/sources/export", sourceH.ExportOPML)
		authed.GET("/sources/jobs/:jobID", sourceH.GetJob)

		// Articles
		articleSvc := article.NewArticleService(deps.Pool)
		articleH := article.NewArticleHandler(articleSvc)
		authed.GET("/articles", articleH.List)
		authed.GET("/articles/:id", articleH.GetByID)
		authed.PATCH("/articles/:id/state", articleH.UpdateState)
		authed.PUT("/articles/:id/progress", articleH.UpdateProgress)
		authed.POST("/articles/batch-state", articleH.BatchState)
		authed.GET("/articles/changes", articleH.Changes)

		// Article SSE + body retry (needs AI client — may be nil in dev)
		sseH := article.NewSSEHandler(deps.Pool, nil, 3)
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

		// Admin routes
		adminGroup := authed.Group("")
		adminGroup.Use(middleware.RequireAdmin())
		{
			allowH := admin.NewAllowlistHandler(allowSvc)
			adminGroup.GET("/admin/allowlist", allowH.List)
			adminGroup.POST("/admin/allowlist", allowH.Add)
			adminGroup.DELETE("/admin/allowlist/:username", allowH.Remove)
		}
	}

	return r
}
