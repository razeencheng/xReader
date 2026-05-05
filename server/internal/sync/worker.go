package sync

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/db/gen"
	"github.com/razeencheng/xreader/internal/ai"
	"github.com/razeencheng/xreader/internal/guest"
	"github.com/razeencheng/xreader/internal/source"
)

type Worker struct {
	pool       *pgxpool.Pool
	queries    *gen.Queries
	job        *FetchJob
	aiClient   ai.AIClient
	interval   time.Duration
	maxWorkers int
}

func NewWorker(pool *pgxpool.Pool, adapter source.SourceAdapter, aiClient ai.AIClient) *Worker {
	return &Worker{
		pool:       pool,
		queries:    gen.New(pool),
		job:        NewFetchJob(pool, adapter),
		aiClient:   aiClient,
		interval:   60 * time.Second,
		maxWorkers: 8,
	}
}

func (w *Worker) Run(ctx context.Context) error {
	log.Println("worker: starting fetch loop")
	go w.catchUpAI(ctx)
	go w.guestCleanupLoop(ctx)
	w.tick(ctx)
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("worker: shutting down")
			return ctx.Err()
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

func (w *Worker) tick(ctx context.Context) {
	sources, err := w.queries.ListSourcesDueForFetch(ctx)
	if err != nil {
		log.Printf("worker: list sources: %v", err)
		return
	}
	if len(sources) == 0 {
		return
	}

	log.Printf("worker: fetching %d sources", len(sources))

	var targetLanguages []string
	if w.aiClient != nil {
		targetLanguages, err = w.queries.ListDistinctNativeLanguages(ctx)
		if err != nil {
			log.Printf("worker: list native languages for eager AI: %v", err)
			targetLanguages = nil
		}
	}

	sem := make(chan struct{}, w.maxWorkers)
	var wg sync.WaitGroup

	for _, src := range sources {
		sem <- struct{}{}
		wg.Add(1)
		go func(s gen.Source) {
			defer wg.Done()
			defer func() { <-sem }()

			inserted, articleIDs, err := w.job.Run(ctx, s)
			if err != nil {
				log.Printf("worker: source %d (%s): %v", s.ID, s.Title, err)
				return
			}
			if inserted > 0 {
				log.Printf("worker: source %d (%s): %d new articles", s.ID, s.Title, inserted)
			}

			if w.aiClient != nil && len(targetLanguages) > 0 {
				for _, aid := range articleIDs {
					for _, targetLang := range targetLanguages {
						job := ai.NewEagerJob(w.pool, w.aiClient, aid, targetLang)
						if err := job.Run(ctx); err != nil {
							log.Printf("worker: eager AI for article %d (%s): %v", aid, targetLang, err)
						}
					}
				}
			}
		}(src)
	}

	wg.Wait()
}

const catchUpThrottle = 2 * time.Second

func (w *Worker) catchUpAI(ctx context.Context) {
	if w.aiClient == nil {
		return
	}

	// Check if catch-up already ran recently (within 10 minutes)
	var lastRun *time.Time
	row := w.pool.QueryRow(ctx,
		"SELECT updated_at FROM article_ai ORDER BY updated_at DESC LIMIT 1")
	var t time.Time
	if row.Scan(&t) == nil {
		lastRun = &t
	}
	if lastRun != nil && time.Since(*lastRun) < 10*time.Minute {
		log.Println("worker: AI catch-up skipped (ran recently)")
		return
	}

	languages, err := w.queries.ListDistinctNativeLanguages(ctx)
	if err != nil || len(languages) == 0 {
		return
	}

	for _, lang := range languages {
		ids, err := w.queries.ListArticlesMissingAI(ctx, gen.ListArticlesMissingAIParams{
			TargetLanguage: lang,
			Limit:          200,
		})
		if err != nil || len(ids) == 0 {
			continue
		}
		log.Printf("worker: AI catch-up: %d articles for %s (throttle %v)", len(ids), lang, catchUpThrottle)
		for _, id := range ids {
			if ctx.Err() != nil {
				return
			}
			job := ai.NewEagerJob(w.pool, w.aiClient, id, lang)
			if err := job.Run(ctx); err != nil {
				log.Printf("worker: AI catch-up article %d (%s): %v", id, lang, err)
			}
			time.Sleep(catchUpThrottle)
		}
	}
	log.Println("worker: AI catch-up complete")
}

func (w *Worker) guestCleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			guestSvc := guest.NewService(w.pool)
			cleaned, err := guestSvc.CleanupExpired(ctx)
			if err != nil {
				log.Printf("worker: guest cleanup error: %v", err)
			} else if cleaned > 0 {
				log.Printf("worker: cleaned up %d expired guest users", cleaned)
			}
		}
	}
}
