package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/ai"
	"github.com/jin/xreader-web/internal/source"
	syncpkg "github.com/jin/xreader-web/internal/sync"
	"github.com/redis/go-redis/v9"
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

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}
	var redisClient *redis.Client
	if opts, err := redis.ParseURL(redisURL); err == nil {
		redisClient = redis.NewClient(opts)
		defer redisClient.Close()
	} else {
		log.Printf("parse redis URL: %v (AI settings overrides disabled)", err)
	}

	var aiClient ai.AIClient
	if cfgPath := os.Getenv("XREADER_AI_CONFIG"); cfgPath != "" {
		settings := ai.NewSettingsService(cfgPath, ai.NewRedisSettingsRepository(redisClient))
		if _, err := settings.LoadResolved(ctx); err != nil {
			log.Printf("ai config not loaded: %v (eager pipeline disabled)", err)
		} else {
			aiClient = ai.NewDynamicClient(settings)
		}
	}

	adapter := source.NewRSSAdapter()
	worker := syncpkg.NewWorker(pool, adapter, aiClient)

	if err := worker.Run(ctx); err != nil && err != context.Canceled {
		log.Fatalf("worker: %v", err)
	}
}
