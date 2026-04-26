package sync

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/ai"
	"github.com/jin/xreader-web/internal/source"
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
