package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/admin"
	"github.com/jin/xreader-web/internal/ai"
	"github.com/jin/xreader-web/internal/platform"
	"github.com/jin/xreader-web/internal/source"
	syncpkg "github.com/jin/xreader-web/internal/sync"
)

func main() {
	if len(os.Args) >= 2 && os.Args[1] == "seed-admin" {
		runSeedAdmin(os.Args[2:])
		return
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}
	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		sessionSecret = "change-me"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	// Start worker in background goroutine
	go func() {
		log.Println("worker: starting fetch loop")
		settings := ai.NewSettingsService(ai.NewPostgresSettingsRepository(pool))
		aiClient := ai.NewDynamicClient(settings)
		adapter := source.NewRSSAdapter()
		worker := syncpkg.NewWorker(pool, adapter, aiClient)
		if err := worker.Run(ctx); err != nil && err != context.Canceled {
			log.Printf("worker: %v", err)
		}
	}()

	// Start HTTP server
	router := platform.NewRouter(platform.RouterDeps{
		Pool:          pool,
		SessionSecret: sessionSecret,
		StaticFS:      staticFS,
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	go func() {
		log.Printf("http: listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http: shutdown error: %v", err)
	}
}

func runSeedAdmin(args []string) {
	var username string
	for _, arg := range args {
		if strings.HasPrefix(arg, "--github-username=") {
			username = strings.TrimPrefix(arg, "--github-username=")
		}
	}
	if username == "" {
		fmt.Fprintf(os.Stderr, "Usage: xreader seed-admin --github-username=<username>\n")
		os.Exit(1)
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	svc := admin.NewAllowlistService(pool)
	if err := svc.SeedAdmin(ctx, username); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	fmt.Printf("Seeded admin: %s\n", username)
}
