package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PgUserStore struct {
	pool *pgxpool.Pool
}

func NewPgUserStore(pool *pgxpool.Pool) *PgUserStore {
	return &PgUserStore{pool: pool}
}

func (s *PgUserStore) UpsertUser(ctx context.Context, githubID int64, username, avatarURL string) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (github_id, github_username, avatar_url)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (github_id) DO UPDATE SET
		   github_username = EXCLUDED.github_username,
		   avatar_url = EXCLUDED.avatar_url
		 RETURNING id`,
		githubID, username, avatarURL,
	).Scan(&id)
	return id, err
}
