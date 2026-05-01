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
	var desiredRole string
	if err := s.pool.QueryRow(ctx,
		`SELECT CASE
			WHEN EXISTS (
				SELECT 1
				FROM auth_allowlist
				WHERE github_username = $1
				  AND note IN ('seed-admin CLI', 'setup-wizard')
			) THEN 'admin'
			ELSE 'user'
		END`,
		username,
	).Scan(&desiredRole); err != nil {
		return 0, err
	}

	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO users (github_id, github_username, avatar_url, role)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (github_id) DO UPDATE SET
		   github_username = EXCLUDED.github_username,
		   avatar_url = EXCLUDED.avatar_url,
		   role = CASE
		     WHEN users.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
		     ELSE users.role
		   END
		 RETURNING id`,
		githubID, username, avatarURL, desiredRole,
	).Scan(&id)
	return id, err
}
