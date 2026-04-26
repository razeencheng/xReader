package article

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"

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
	if err == nil && aiRow.BodyTranslationStatus == "done" {
		setSSEHeaders(c)
		writeCachedBodyTranslation(c.Writer, aiRow.BodyTranslationContent)
		return
	}

	if h.aiClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service not configured"})
		return
	}

	article, err := h.queries.GetArticleByID(ctx, articleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
		return
	}

	paragraphs := ai.SplitParagraphs(article.ContentHtml)
	if len(paragraphs) == 0 {
		setSSEHeaders(c)
		writeSSENamedEvent(c.Writer, "done", map[string]any{})
		return
	}

	setSSEHeaders(c)
	h.streamTranslation(ctx, c.Writer, articleID, targetLang, paragraphs)
}

func (h *SSEHandler) streamTranslation(ctx context.Context, w http.ResponseWriter, articleID int64, targetLang string, paragraphs []ai.Paragraph) {
	_ = h.queries.EnsureArticleAI(ctx, gen.EnsureArticleAIParams{
		ArticleID: articleID, TargetLanguage: targetLang,
	})
	_ = h.queries.SetBodyTranslationStatus(ctx, gen.SetBodyTranslationStatusParams{
		ArticleID: articleID, TargetLanguage: targetLang, BodyTranslationStatus: "processing",
	})

	allTranslated := make([]ai.TranslatedParagraph, 0, len(paragraphs))

	for start := 0; start < len(paragraphs); start += h.batchSize {
		end := start + h.batchSize
		if end > len(paragraphs) {
			end = len(paragraphs)
		}

		batch := paragraphs[start:end]
		results, err := h.translateBatch(ctx, batch, targetLang)
		if err != nil {
			log.Printf("sse: translate batch for article %d: %v", articleID, err)
			break
		}

		for _, tp := range results {
			writeSSENamedEvent(w, "paragraph", map[string]any{
				"index":       tp.Index,
				"original":    tp.Original,
				"translation": tp.Translation,
			})
			allTranslated = append(allTranslated, tp)
		}
	}

	writeSSENamedEvent(w, "done", map[string]any{})

	go func() {
		bgCtx := context.Background()
		data, _ := json.Marshal(allTranslated)
		if err := h.queries.SetBodyTranslation(bgCtx, gen.SetBodyTranslationParams{
			ArticleID: articleID, TargetLanguage: targetLang,
			BodyTranslationContent: data, BodyTranslationStatus: "done",
		}); err != nil {
			log.Printf("sse: persist body translation for article %d: %v", articleID, err)
		}
	}()
}

func (h *SSEHandler) translateBatch(ctx context.Context, batch []ai.Paragraph, targetLang string) ([]ai.TranslatedParagraph, error) {
	var prompt strings.Builder
	for _, p := range batch {
		fmt.Fprintf(&prompt, "[%d] %s\n", p.Index, p.Original)
	}

	resp, err := h.aiClient.ChatCompletion(ctx, ai.ChatRequest{
		Messages: []ai.ChatMessage{
			{Role: "system", Content: fmt.Sprintf("Translate each numbered paragraph into %s. Keep the numbering and output one translated paragraph per line.", targetLang)},
			{Role: "user", Content: prompt.String()},
		},
	})
	if err != nil {
		return nil, err
	}

	lines := strings.Split(strings.TrimSpace(resp.Content), "\n")
	results := make([]ai.TranslatedParagraph, 0, len(batch))
	for _, p := range batch {
		translation := ""
		prefix := fmt.Sprintf("[%d]", p.Index)
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, prefix) {
				translation = strings.TrimSpace(strings.TrimPrefix(line, prefix))
				break
			}
		}
		results = append(results, ai.TranslatedParagraph{
			Index: p.Index, Original: p.Original, Translation: translation,
		})
	}
	return results, nil
}

func loadCachedTranslations(ctx context.Context, q *gen.Queries, articleID int64, targetLang string) map[int]ai.TranslatedParagraph {
	cached := make(map[int]ai.TranslatedParagraph)
	aiRow, err := q.GetArticleAI(ctx, gen.GetArticleAIParams{ArticleID: articleID, TargetLanguage: targetLang})
	if err != nil || len(aiRow.BodyTranslationContent) == 0 {
		return cached
	}
	var paragraphs []ai.TranslatedParagraph
	if err := json.Unmarshal(aiRow.BodyTranslationContent, &paragraphs); err != nil {
		return cached
	}
	for _, p := range paragraphs {
		cached[p.Index] = p
	}
	return cached
}

func writeCachedBodyTranslation(w http.ResponseWriter, payload []byte) {
	var content []ai.TranslatedParagraph
	if err := json.Unmarshal(payload, &content); err != nil {
		writeSSENamedEvent(w, "done", map[string]any{})
		return
	}

	for _, tp := range content {
		writeSSENamedEvent(w, "paragraph", map[string]any{
			"index":       tp.Index,
			"original":    tp.Original,
			"translation": tp.Translation,
		})
	}
	writeSSENamedEvent(w, "done", map[string]any{})
}

func writeSSENamedEvent(w http.ResponseWriter, event string, payload map[string]any) {
	data, _ := json.Marshal(payload)
	_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
}

func setSSEHeaders(c *gin.Context) {
	c.Status(http.StatusOK)
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Flush()
}
