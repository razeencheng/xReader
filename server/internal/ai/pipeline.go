package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
)

type EagerJob struct {
	pool       *pgxpool.Pool
	queries    *gen.Queries
	client     AIClient
	articleID  int64
	targetLang string
}

func NewEagerJob(pool *pgxpool.Pool, client AIClient, articleID int64, targetLang string) *EagerJob {
	return &EagerJob{
		pool:       pool,
		queries:    gen.New(pool),
		client:     client,
		articleID:  articleID,
		targetLang: targetLang,
	}
}

func (j *EagerJob) Run(ctx context.Context) error {
	article, err := j.queries.GetArticleByID(ctx, j.articleID)
	if err != nil {
		return fmt.Errorf("get article: %w", err)
	}

	if err := j.queries.EnsureArticleAI(ctx, gen.EnsureArticleAIParams{
		ArticleID:      j.articleID,
		TargetLanguage: j.targetLang,
	}); err != nil {
		return fmt.Errorf("ensure article_ai: %w", err)
	}

	detectedLang := DetectLanguage(article.ContentText, article.Language)

	if detectedLang == j.targetLang {
		if err := j.queries.UpsertTitleTranslation(ctx, gen.UpsertTitleTranslationParams{
			ArticleID:       j.articleID,
			TargetLanguage:  j.targetLang,
			TitleTranslated: article.Title,
		}); err != nil {
			return fmt.Errorf("upsert title: %w", err)
		}
	} else {
		resp, err := j.client.ChatCompletion(ctx, ChatRequest{
			Messages: []ChatMessage{
				{Role: "system", Content: TitleTranslationPrompt(j.targetLang)},
				{Role: "user", Content: article.Title},
			},
		})
		if err != nil {
			log.Printf("ai: title translation failed for article %d: %v", j.articleID, err)
		} else {
			if err := j.queries.UpsertTitleTranslation(ctx, gen.UpsertTitleTranslationParams{
				ArticleID:       j.articleID,
				TargetLanguage:  j.targetLang,
				TitleTranslated: resp.Content,
			}); err != nil {
				return fmt.Errorf("upsert title: %w", err)
			}
		}
	}

	if len(article.ContentText) < 280 {
		if err := j.queries.UpsertSummary(ctx, gen.UpsertSummaryParams{
			ArticleID:         j.articleID,
			TargetLanguage:    j.targetLang,
			SummaryStatus:     "skipped",
			SummarySkipReason: "short",
		}); err != nil {
			return fmt.Errorf("upsert summary skip: %w", err)
		}
	} else {
		resp, err := j.client.ChatCompletion(ctx, ChatRequest{
			Messages: []ChatMessage{
				{Role: "system", Content: SummaryPrompt(j.targetLang)},
				{Role: "user", Content: article.ContentText},
			},
		})
		if err != nil {
			if uErr := j.queries.UpsertSummary(ctx, gen.UpsertSummaryParams{
				ArticleID:      j.articleID,
				TargetLanguage: j.targetLang,
				SummaryStatus:  "failed",
			}); uErr != nil {
				log.Printf("ai: failed to record summary failure: %v", uErr)
			}
			return fmt.Errorf("summary: %w", err)
		}
		if err := j.queries.UpsertSummary(ctx, gen.UpsertSummaryParams{
			ArticleID:      j.articleID,
			TargetLanguage: j.targetLang,
			Summary:        resp.Content,
			SummaryStatus:  "done",
		}); err != nil {
			return fmt.Errorf("upsert summary: %w", err)
		}
	}

	return nil
}
