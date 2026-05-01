package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/admin"
	"github.com/jin/xreader-web/internal/platform"
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
		log.Fatal("SESSION_SECRET not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("connect to database: %v", err)
	}
	defer pool.Close()

	r := platform.NewRouter(platform.RouterDeps{
		Pool:          pool,
		SessionSecret: sessionSecret,
	})
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
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
		fmt.Fprintf(os.Stderr, "Usage: api seed-admin --github-username=<username>\n")
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
