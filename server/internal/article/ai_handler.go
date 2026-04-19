package article

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/middleware"
)

type AIHandler struct {
	queries *gen.Queries
}

func NewAIHandler(pool *pgxpool.Pool) *AIHandler {
	return &AIHandler{queries: gen.New(pool)}
}

type articleAIResponse struct {
	TitleTranslated        string `json:"title_translated,omitempty"`
	Summary                string `json:"summary,omitempty"`
	BodyTranslationStatus  string `json:"body_translation_status,omitempty"`
	BodyTranslationContent string `json:"body_translation_content,omitempty"`
}

func (h *AIHandler) GetArticleAI(c *gin.Context) {
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

	lang := c.DefaultQuery("lang", "zh-CN")

	row, err := h.queries.GetArticleAI(c.Request.Context(), gen.GetArticleAIParams{
		ArticleID:      articleID,
		TargetLanguage: lang,
	})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no AI data"})
		return
	}

	c.JSON(http.StatusOK, articleAIResponse{
		TitleTranslated:        row.TitleTranslated,
		Summary:                row.Summary,
		BodyTranslationStatus:  row.BodyTranslationStatus,
		BodyTranslationContent: string(row.BodyTranslationContent),
	})
}
