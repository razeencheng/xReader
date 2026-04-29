package article

import (
    "net/http"
    "strconv"

    "github.com/gin-gonic/gin"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/jin/xreader-web/db/gen"
    "github.com/jin/xreader-web/internal/middleware"
)

type BodyRetryHandler struct {
    pool    *pgxpool.Pool
    queries *gen.Queries
}

func NewBodyRetryHandler(pool *pgxpool.Pool) *BodyRetryHandler {
    return &BodyRetryHandler{pool: pool, queries: gen.New(pool)}
}

func (h *BodyRetryHandler) Retry(c *gin.Context) {
    user := middleware.GetUser(c)
    if user == nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
        return
    }

    articleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
        return
    }

    // Verify article ownership via its source
    article, err := h.queries.GetArticleByID(c.Request.Context(), articleID)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
        return
    }
    source, err := h.queries.GetSourceByID(c.Request.Context(), article.SourceID)
    if err != nil || source.UserID != user.ID {
        c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
        return
    }

    targetLang := user.NativeLanguage
    if targetLang == "" {
        targetLang = "zh-CN"
    }

    // Reset body translation
    err = h.queries.ResetBodyTranslation(c.Request.Context(), gen.ResetBodyTranslationParams{
        ArticleID:      articleID,
        TargetLanguage: targetLang,
    })
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to reset translation"})
        return
    }

    c.JSON(http.StatusOK, gin.H{"status": "reset", "message": "body translation will be regenerated on next read"})
}
