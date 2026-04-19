package auth

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisStateStore struct {
	rdb *redis.Client
}

func NewRedisStateStore(rdb *redis.Client) *RedisStateStore {
	return &RedisStateStore{rdb: rdb}
}

func (s *RedisStateStore) Save(ctx context.Context, state string) error {
	return s.rdb.Set(ctx, "oauth_state:"+state, "1", 10*time.Minute).Err()
}

func (s *RedisStateStore) Verify(ctx context.Context, state string) (bool, error) {
	key := "oauth_state:" + state
	val, err := s.rdb.Get(ctx, key).Result()
	if err == redis.Nil {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	s.rdb.Del(ctx, key)
	return val == "1", nil
}
