package article

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/ai"
	"github.com/jin/xreader-web/internal/middleware"
)

type SSEHandler struct {
	pool      *pgxpool.Pool
	queries   *gen.Queries
	aiClient  ai.AIClient
	batchSize int
}

func NewSSEHandler(pool *pgxpool.Pool, aiClient ai.AIClient, batchSize int) *SSEHandler {
	if batchSize <= 0 {
		batchSize = 1
	}
	return &SSEHandler{
		pool:      pool,
		queries:   gen.New(pool),
		aiClient:  aiClient,
		batchSize: batchSize,
	}
}

func (h *SSEHandler) BodyTranslation(c *gin.Context) {
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

	targetLang := user.NativeLanguage
	if targetLang == "" {
		targetLang = "zh-CN"
	}

	ctx := c.Request.Context()
	aiRow, err := h.queries.GetArticleAI(ctx, gen.GetArticleAIParams{ArticleID: articleID, TargetLanguage: targetLang})
	if err == nil {
		switch aiRow.BodyTranslationStatus {
		case "done":
			setSSEHeaders(c)
			writeCachedBodyTranslation(c.Writer, aiRow.BodyTranslationContent)
			return
		case "processing":
			c.JSON(http.StatusAccepted, gin.H{"status": "processing"})
			return
		}
	}

	go func() {
		job := ai.NewLazyJob(h.pool, h.aiClient, articleID, targetLang, h.batchSize)
		if runErr := job.Run(context.Background()); runErr != nil {
			fmt.Printf("body translation job failed for article %d: %v\n", articleID, runErr)
		}
	}()

	c.JSON(http.StatusAccepted, gin.H{"status": "started"})
}

func writeCachedBodyTranslation(w http.ResponseWriter, payload []byte) {
	var content []ai.TranslatedParagraph
	if err := json.Unmarshal(payload, &content); err != nil {
		writeSSEEvent(w, map[string]any{"type": "done"})
		return
	}

	for _, tp := range content {
		writeSSEEvent(w, map[string]any{
			"type":        "paragraph",
			"index":       tp.Index,
			"original":    tp.Original,
			"translation": tp.Translation,
		})
	}
	writeSSEEvent(w, map[string]any{"type": "done"})
}

func writeSSEEvent(w http.ResponseWriter, payload map[string]any) {
	data, _ := json.Marshal(payload)
	_, _ = fmt.Fprintf(w, "data: %s\n\n", data)
}

func setSSEHeaders(c *gin.Context) {
	c.Status(http.StatusOK)
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Flush()
}
