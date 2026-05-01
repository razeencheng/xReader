package auth

import (
	"context"
	"time"
)

const sessionTTL = 30 * 24 * time.Hour

type SessionStore interface {
	Create(ctx context.Context, userID int64, userAgent string) (sessionID string, err error)
	Get(ctx context.Context, sessionID string) (userID int64, err error)
	Delete(ctx context.Context, sessionID string) error
	Touch(ctx context.Context, sessionID string) error
}
