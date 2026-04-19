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
    articleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
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
