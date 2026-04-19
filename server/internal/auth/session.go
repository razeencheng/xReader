package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const sessionTTL = 30 * 24 * time.Hour

type SessionStore interface {
	Create(ctx context.Context, userID int64, userAgent string) (sessionID string, err error)
	Get(ctx context.Context, sessionID string) (userID int64, err error)
	Delete(ctx context.Context, sessionID string) error
	Touch(ctx context.Context, sessionID string) error
}

type RedisSessionStore struct {
	rdb  *redis.Client
	pool *pgxpool.Pool
}

func NewRedisSessionStore(rdb *redis.Client, pool *pgxpool.Pool) *RedisSessionStore {
	return &RedisSessionStore{rdb: rdb, pool: pool}
}

func (s *RedisSessionStore) Create(ctx context.Context, userID int64, userAgent string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	sessionID := hex.EncodeToString(b)

	if err := s.rdb.Set(ctx, "session:"+sessionID, userID, sessionTTL).Err(); err != nil {
		return "", fmt.Errorf("redis set session: %w", err)
	}

	_, err := s.pool.Exec(ctx,
		"INSERT INTO auth_sessions (id, user_id, user_agent) VALUES ($1, $2, $3)",
		sessionID, userID, userAgent,
	)
	if err != nil {
		return "", fmt.Errorf("insert session row: %w", err)
	}

	return sessionID, nil
}

func (s *RedisSessionStore) Get(ctx context.Context, sessionID string) (int64, error) {
	val, err := s.rdb.Get(ctx, "session:"+sessionID).Int64()
	if err == redis.Nil {
		return 0, fmt.Errorf("session not found")
	}
	if err != nil {
		return 0, err
	}
	return val, nil
}

func (s *RedisSessionStore) Delete(ctx context.Context, sessionID string) error {
	s.rdb.Del(ctx, "session:"+sessionID)
	_, _ = s.pool.Exec(ctx, "DELETE FROM auth_sessions WHERE id = $1", sessionID)
	return nil
}

func (s *RedisSessionStore) Touch(ctx context.Context, sessionID string) error {
	s.rdb.Expire(ctx, "session:"+sessionID, sessionTTL)
	_, _ = s.pool.Exec(ctx, "UPDATE auth_sessions SET last_seen_at = now() WHERE id = $1", sessionID)
	return nil
}
