package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jin/xreader-web/internal/ai"
)

func main() {
	pool, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	cfg, err := ai.LoadConfig(os.Getenv("XREADER_AI_CONFIG"))
	if err != nil {
		log.Fatal(err)
	}
	client := ai.NewClient(cfg)

	ctx := context.Background()
	rows, err := pool.Query(ctx, "SELECT id, title FROM articles ORDER BY id")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	type article struct {
		ID    int64
		Title string
	}
	var articles []article
	for rows.Next() {
		var a article
		if err := rows.Scan(&a.ID, &a.Title); err != nil {
			log.Fatal(err)
		}
		articles = append(articles, a)
	}

	fmt.Printf("Processing %d articles...\n", len(articles))
	for _, a := range articles {
		job := ai.NewEagerJob(pool, client, a.ID, "zh-CN")
		if err := job.Run(ctx); err != nil {
			log.Printf("article %d (%s): %v", a.ID, a.Title, err)
			continue
		}
		fmt.Printf("article %d: done\n", a.ID)
	}
	fmt.Println("Backfill complete.")
}
