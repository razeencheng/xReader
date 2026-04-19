package sync

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/db/gen"
	"github.com/jin/xreader-web/internal/source"
)

type Worker struct {
	pool       *pgxpool.Pool
	queries    *gen.Queries
	job        *FetchJob
	interval   time.Duration
	maxWorkers int
}

func NewWorker(pool *pgxpool.Pool, adapter source.SourceAdapter) *Worker {
	return &Worker{
		pool:       pool,
		queries:    gen.New(pool),
		job:        NewFetchJob(pool, adapter),
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

	sem := make(chan struct{}, w.maxWorkers)
	var wg sync.WaitGroup

	for _, src := range sources {
		sem <- struct{}{}
		wg.Add(1)
		go func(s gen.Source) {
			defer wg.Done()
			defer func() { <-sem }()

			inserted, err := w.job.Run(ctx, s)
			if err != nil {
				log.Printf("worker: source %d (%s): %v", s.ID, s.Title, err)
				return
			}
			if inserted > 0 {
				log.Printf("worker: source %d (%s): %d new articles", s.ID, s.Title, inserted)
			}
		}(src)
	}

	wg.Wait()
}
