package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/source"
	syncpkg "github.com/jin/xreader-web/internal/sync"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	adapter := source.NewRSSAdapter()
	worker := syncpkg.NewWorker(pool, adapter)

	if err := worker.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("worker: %v", err)
	}
}
