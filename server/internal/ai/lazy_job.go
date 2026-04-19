package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
)

type TranslatedParagraph struct {
	Index       int    `json:"index"`
	Original    string `json:"original"`
	Translation string `json:"translation"`
}

type LazyJob struct {
	pool       *pgxpool.Pool
	queries    *gen.Queries
	client     AIClient
	articleID  int64
	targetLang string
	batchSize  int
}

func NewLazyJob(pool *pgxpool.Pool, client AIClient, articleID int64, targetLang string, batchSize int) *LazyJob {
	if batchSize <= 0 {
		batchSize = 1
	}
	return &LazyJob{
		pool:       pool,
		queries:    gen.New(pool),
		client:     client,
		articleID:  articleID,
		targetLang: targetLang,
		batchSize:  batchSize,
	}
}

func (j *LazyJob) Run(ctx context.Context) error {
	article, err := j.queries.GetArticleByID(ctx, j.articleID)
	if err != nil {
		return fmt.Errorf("get article: %w", err)
	}

	if err := j.ensureAI(ctx); err != nil {
		return err
	}

	if err := j.queries.SetBodyTranslationStatus(ctx, gen.SetBodyTranslationStatusParams{
		ArticleID:             j.articleID,
		TargetLanguage:        j.targetLang,
		BodyTranslationStatus: "processing",
	}); err != nil {
		return fmt.Errorf("set body translation processing: %w", err)
	}

	paragraphs := SplitParagraphs(article.ContentHtml)
	if len(paragraphs) == 0 {
		return j.persistDone(ctx, nil)
	}

	translated := make([]TranslatedParagraph, 0, len(paragraphs))
	for start := 0; start < len(paragraphs); start += j.batchSize {
		end := start + j.batchSize
		if end > len(paragraphs) {
			end = len(paragraphs)
		}

		batch := paragraphs[start:end]
		batchResult, err := j.translateBatch(ctx, batch)
		if err != nil {
			if setErr := j.queries.SetBodyTranslationStatus(ctx, gen.SetBodyTranslationStatusParams{
				ArticleID:             j.articleID,
				TargetLanguage:        j.targetLang,
				BodyTranslationStatus: "failed",
			}); setErr != nil {
				log.Printf("ai: set body translation failed status error: %v", setErr)
			}
			return fmt.Errorf("translate batch: %w", err)
		}

		translated = append(translated, batchResult...)
	}

	return j.persistDone(ctx, translated)
}

func (j *LazyJob) ensureAI(ctx context.Context) error {
	if err := j.queries.EnsureArticleAI(ctx, gen.EnsureArticleAIParams{
		ArticleID:      j.articleID,
		TargetLanguage: j.targetLang,
	}); err != nil {
		return fmt.Errorf("ensure article ai: %w", err)
	}
	return nil
}

func (j *LazyJob) translateBatch(ctx context.Context, batch []Paragraph) ([]TranslatedParagraph, error) {
	var prompt strings.Builder
	for _, paragraph := range batch {
		fmt.Fprintf(&prompt, "[%d] %s\n", paragraph.Index, paragraph.Original)
	}

	resp, err := j.client.ChatCompletion(ctx, ChatRequest{
		Messages: []ChatMessage{
			{
				Role:    "system",
				Content: fmt.Sprintf("Translate each numbered paragraph into %s. Keep the numbering and output one translated paragraph per line.", j.targetLang),
			},
			{
				Role:    "user",
				Content: prompt.String(),
			},
		},
	})
	if err != nil {
		return nil, err
	}

	return parseBatchTranslation(batch, resp.Content), nil
}

func parseBatchTranslation(batch []Paragraph, response string) []TranslatedParagraph {
	lines := strings.Split(strings.TrimSpace(response), "\n")
	results := make([]TranslatedParagraph, 0, len(batch))
	for i, paragraph := range batch {
		translation := ""
		if i < len(lines) {
			translation = strings.TrimSpace(lines[i])
		}
		prefix := fmt.Sprintf("[%d]", paragraph.Index)
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, prefix) {
				translation = strings.TrimSpace(strings.TrimPrefix(line, prefix))
				break
			}
		}

		results = append(results, TranslatedParagraph{
			Index:       paragraph.Index,
			Original:    paragraph.Original,
			Translation: translation,
		})
	}

	return results
}

func (j *LazyJob) persistDone(ctx context.Context, translated []TranslatedParagraph) error {
	if translated == nil {
		translated = []TranslatedParagraph{}
	}

	data, err := json.Marshal(translated)
	if err != nil {
		return fmt.Errorf("marshal body translation: %w", err)
	}

	if err := j.queries.SetBodyTranslationContent(ctx, gen.SetBodyTranslationContentParams{
		ArticleID:              j.articleID,
		TargetLanguage:         j.targetLang,
		BodyTranslationContent: data,
	}); err != nil {
		return fmt.Errorf("persist body translation: %w", err)
	}

	return nil
}
