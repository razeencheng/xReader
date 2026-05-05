# Guest Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow unauthenticated visitors to browse admin's content with full interactive features (read state, highlights, AI translation) in an isolated data space that auto-expires after 1 day.

**Architecture:** New `OptionalAuth` middleware auto-creates `role=guest` users on first unauthenticated request when guest mode is enabled. Guest queries use admin's sources/articles for content but guest's own user_id for state. A `GuestReadOnly` middleware blocks source mutations. Cleanup runs hourly in the sync worker.

**Tech Stack:** Go 1.22 + Gin, sqlc + PostgreSQL 16, Next.js 15 + TypeScript + Zustand + TanStack Query

---

## Task 1: Database Migration

**Files:**
- Create: `server/db/migrations/012_guest_mode.up.sql`
- Create: `server/db/migrations/012_guest_mode.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- 012_guest_mode.up.sql

-- Allow guest users to have NULL github_id
ALTER TABLE users ALTER COLUMN github_id DROP NOT NULL;

-- Replace absolute unique with partial unique (only non-null values)
DROP INDEX IF EXISTS users_github_id_key;
CREATE UNIQUE INDEX users_github_id_key ON users (github_id) WHERE github_id IS NOT NULL;

-- Track when guest users expire
ALTER TABLE users ADD COLUMN expires_at TIMESTAMPTZ;

-- Fast lookup for cleanup job
CREATE INDEX idx_users_guest_expires ON users (role, expires_at)
  WHERE role = 'guest';

-- Fast session deletion by user_id during cleanup
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions (user_id);
```

- [ ] **Step 2: Write the down migration**

```sql
-- 012_guest_mode.down.sql

DROP INDEX IF EXISTS idx_auth_sessions_user_id;
DROP INDEX IF EXISTS idx_users_guest_expires;
ALTER TABLE users DROP COLUMN IF EXISTS expires_at;

-- Remove guest users before restoring constraint
DELETE FROM highlights WHERE user_id IN (SELECT id FROM users WHERE role = 'guest');
DELETE FROM article_state_changes WHERE user_id IN (SELECT id FROM users WHERE role = 'guest');
DELETE FROM users WHERE role = 'guest';

DROP INDEX IF EXISTS users_github_id_key;
ALTER TABLE users ALTER COLUMN github_id SET NOT NULL;
CREATE UNIQUE INDEX users_github_id_key ON users (github_id);
```

- [ ] **Step 3: Run the migration and verify**

Run: `cd server && go build -o bin/xreader ./cmd/xreader && make migrate-up`
Expected: Migration applies cleanly.

Verify: `psql $DATABASE_URL -c "\d users"` — should show `github_id` as nullable with `expires_at` column.

- [ ] **Step 4: Commit**

```bash
git add server/db/migrations/012_guest_mode.up.sql server/db/migrations/012_guest_mode.down.sql
git commit -m "feat(db): add guest mode migration — nullable github_id, expires_at, indexes"
```

---

## Task 2: Guest Service (Backend Core)

**Files:**
- Create: `server/internal/guest/service.go`
- Create: `server/internal/guest/service_test.go`

This service encapsulates all guest-specific logic: creating guest users, checking guest mode status, resolving content owner (admin ID), and cleanup.

- [ ] **Step 1: Write the test file**

```go
// server/internal/guest/service_test.go
package guest

import (
	"context"
	"testing"
	"time"

	"github.com/razeencheng/xreader/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateGuestUser(t *testing.T) {
	ctx := context.Background()
	pool := testutil.SetupTestDB(t)
	svc := NewService(pool)

	// Seed an admin user first
	seedAdmin(t, pool)

	guest, err := svc.CreateGuest(ctx)
	require.NoError(t, err)
	assert.Equal(t, "guest", guest.Role)
	assert.NotEmpty(t, guest.Username)
	assert.True(t, guest.ExpiresAt.After(time.Now()))
	assert.True(t, guest.ExpiresAt.Before(time.Now().Add(25*time.Hour)))
}

func TestGuestModeStatus(t *testing.T) {
	ctx := context.Background()
	pool := testutil.SetupTestDB(t)
	svc := NewService(pool)

	// No admin, no setting → disabled
	enabled, err := svc.IsEnabled(ctx)
	require.NoError(t, err)
	assert.False(t, enabled)

	// Enable setting but no admin → still disabled
	_, _ = pool.Exec(ctx, "INSERT INTO settings (key, value) VALUES ('guest_mode_enabled', 'true')")
	enabled, err = svc.IsEnabled(ctx)
	require.NoError(t, err)
	assert.False(t, enabled)

	// Seed admin → now enabled
	seedAdmin(t, pool)
	enabled, err = svc.IsEnabled(ctx)
	require.NoError(t, err)
	assert.True(t, enabled)
}

func TestContentOwnerID(t *testing.T) {
	ctx := context.Background()
	pool := testutil.SetupTestDB(t)
	svc := NewService(pool)

	seedAdmin(t, pool)
	adminID, err := svc.ContentOwnerID(ctx)
	require.NoError(t, err)
	assert.Greater(t, adminID, int64(0))
}

func TestCleanupExpiredGuests(t *testing.T) {
	ctx := context.Background()
	pool := testutil.SetupTestDB(t)
	svc := NewService(pool)

	seedAdmin(t, pool)

	// Create a guest manually with expired time
	_, err := pool.Exec(ctx,
		`INSERT INTO users (github_username, role, expires_at, native_language, density_pref, theme_pref)
		 VALUES ('guest-expired', 'guest', now() - interval '1 hour', 'zh-CN', 'comfortable', 'system')`)
	require.NoError(t, err)

	// Create a valid guest
	guest, err := svc.CreateGuest(ctx)
	require.NoError(t, err)

	cleaned, err := svc.CleanupExpired(ctx)
	require.NoError(t, err)
	assert.Equal(t, int64(1), cleaned)

	// Valid guest still exists
	var count int
	_ = pool.QueryRow(ctx, "SELECT COUNT(*) FROM users WHERE id = $1", guest.ID).Scan(&count)
	assert.Equal(t, 1, count)
}

func seedAdmin(t *testing.T, pool interface{ Exec(context.Context, string, ...any) (interface{ RowsAffected() int64 }, error) }) {
	t.Helper()
	ctx := context.Background()
	type execer interface {
		Exec(context.Context, string, ...any) (interface{ RowsAffected() int64 }, error)
	}
	// Use the pool directly — testutil pools implement pgxpool.Pool
	_, err := pool.(*testutil.TestPool).Exec(ctx,
		`INSERT INTO users (github_id, github_username, role, native_language, density_pref, theme_pref)
		 VALUES (1001, 'testadmin', 'admin', 'zh-CN', 'comfortable', 'system')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)
}
```

Note: The `seedAdmin` helper above is a placeholder — adapt to match `testutil.SetupTestDB`'s actual return type (likely `*pgxpool.Pool`). The real helper:

```go
func seedAdmin(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	_, err := pool.Exec(context.Background(),
		`INSERT INTO users (github_id, github_username, role, native_language, density_pref, theme_pref)
		 VALUES (1001, 'testadmin', 'admin', 'zh-CN', 'comfortable', 'system')
		 ON CONFLICT DO NOTHING`)
	require.NoError(t, err)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/guest/... -v -count=1`
Expected: Compilation fails — package `guest` doesn't exist yet.

- [ ] **Step 3: Write the service implementation**

```go
// server/internal/guest/service.go
package guest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const GuestTTL = 24 * time.Hour

type GuestUser struct {
	ID        int64
	Username  string
	Role      string
	ExpiresAt time.Time
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

func (s *Service) IsEnabled(ctx context.Context) (bool, error) {
	var val string
	err := s.pool.QueryRow(ctx,
		"SELECT value FROM settings WHERE key = 'guest_mode_enabled'",
	).Scan(&val)
	if err != nil {
		return false, nil // no setting = disabled
	}
	if val != "true" {
		return false, nil
	}
	// Must also have at least one admin user row
	var exists bool
	err = s.pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin')",
	).Scan(&exists)
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (s *Service) ContentOwnerID(ctx context.Context) (int64, error) {
	var id int64
	err := s.pool.QueryRow(ctx,
		"SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("no admin user found: %w", err)
	}
	return id, nil
}

func (s *Service) CreateGuest(ctx context.Context) (*GuestUser, error) {
	username := "guest-" + randomHex(8)
	expiresAt := time.Now().Add(GuestTTL)

	// Get admin defaults for native_language, density_pref, theme_pref
	var lang, density, theme string
	err := s.pool.QueryRow(ctx,
		"SELECT native_language, density_pref, theme_pref FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1",
	).Scan(&lang, &density, &theme)
	if err != nil {
		lang, density, theme = "zh-CN", "comfortable", "system"
	}

	var id int64
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (github_username, role, expires_at, native_language, density_pref, theme_pref)
		 VALUES ($1, 'guest', $2, $3, $4, $5)
		 RETURNING id`,
		username, expiresAt, lang, density, theme,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create guest user: %w", err)
	}

	return &GuestUser{
		ID:        id,
		Username:  username,
		Role:      "guest",
		ExpiresAt: expiresAt,
	}, nil
}

func (s *Service) IsExpired(ctx context.Context, userID int64) (bool, error) {
	var expiresAt *time.Time
	err := s.pool.QueryRow(ctx,
		"SELECT expires_at FROM users WHERE id = $1",
		userID,
	).Scan(&expiresAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return true, nil
		}
		return false, err
	}
	if expiresAt == nil {
		return false, nil // non-guest user
	}
	return time.Now().After(*expiresAt), nil
}

func (s *Service) CleanupExpired(ctx context.Context) (int64, error) {
	// Delete from tables without CASCADE first
	_, _ = s.pool.Exec(ctx,
		"DELETE FROM highlights WHERE user_id IN (SELECT id FROM users WHERE role = 'guest' AND expires_at < now())")
	_, _ = s.pool.Exec(ctx,
		"DELETE FROM article_state_changes WHERE user_id IN (SELECT id FROM users WHERE role = 'guest' AND expires_at < now())")

	// Delete user row — article_states and auth_sessions have ON DELETE CASCADE
	tag, err := s.pool.Exec(ctx,
		"DELETE FROM users WHERE role = 'guest' AND expires_at < now()")
	if err != nil {
		return 0, fmt.Errorf("cleanup guests: %w", err)
	}
	return tag.RowsAffected(), nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
```

- [ ] **Step 4: Run tests**

Run: `cd server && go test ./internal/guest/... -v -count=1`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/internal/guest/
git commit -m "feat(guest): add guest service — create, expire, cleanup, status check"
```

---

## Task 3: OptionalAuth Middleware

**Files:**
- Modify: `server/internal/middleware/auth.go`
- Create: `server/internal/middleware/auth_test.go` (or add to existing)

- [ ] **Step 1: Write the test**

```go
// server/internal/middleware/guest_test.go
package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/razeencheng/xreader/internal/auth"
	"github.com/razeencheng/xreader/internal/guest"
	"github.com/razeencheng/xreader/internal/middleware"
	"github.com/razeencheng/xreader/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOptionalAuth_GuestModeOff_Returns401(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	sessions := auth.NewPgSessionStore(pool)
	guestSvc := guest.NewService(pool)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.OptionalAuth(sessions, pool, guestSvc))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, 401, w.Code)
}

func TestOptionalAuth_GuestModeOn_CreatesGuest(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	sessions := auth.NewPgSessionStore(pool)
	guestSvc := guest.NewService(pool)

	// Enable guest mode
	ctx := context.Background()
	_, _ = pool.Exec(ctx, "INSERT INTO settings (key, value) VALUES ('guest_mode_enabled', 'true')")
	_, _ = pool.Exec(ctx,
		`INSERT INTO users (github_id, github_username, role, native_language, density_pref, theme_pref)
		 VALUES (1001, 'testadmin', 'admin', 'zh-CN', 'comfortable', 'system')`)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.OptionalAuth(sessions, pool, guestSvc))
	r.GET("/test", func(c *gin.Context) {
		user := middleware.GetUser(c)
		c.JSON(200, gin.H{"role": user.Role})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, 200, w.Code)
	assert.Contains(t, w.Body.String(), `"role":"guest"`)
	// Should have Set-Cookie header
	cookies := w.Result().Cookies()
	require.NotEmpty(t, cookies)
	assert.Equal(t, "xreader_session", cookies[0].Name)
}

func TestOptionalAuth_ExpiredGuest_Returns401(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	sessions := auth.NewPgSessionStore(pool)
	guestSvc := guest.NewService(pool)

	ctx := context.Background()
	_, _ = pool.Exec(ctx, "INSERT INTO settings (key, value) VALUES ('guest_mode_enabled', 'true')")
	_, _ = pool.Exec(ctx,
		`INSERT INTO users (github_id, github_username, role, native_language, density_pref, theme_pref)
		 VALUES (1001, 'testadmin', 'admin', 'zh-CN', 'comfortable', 'system')`)

	// Create an expired guest
	var guestID int64
	_ = pool.QueryRow(ctx,
		`INSERT INTO users (github_username, role, expires_at, native_language, density_pref, theme_pref)
		 VALUES ('guest-expired', 'guest', now() - interval '1 hour', 'zh-CN', 'comfortable', 'system')
		 RETURNING id`).Scan(&guestID)
	sessionID, _ := sessions.Create(ctx, guestID, "test")

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.OptionalAuth(sessions, pool, guestSvc))
	r.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})

	req := httptest.NewRequest("GET", "/test", nil)
	req.AddCookie(&http.Cookie{Name: "xreader_session", Value: sessionID})
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, 401, w.Code)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/middleware/... -v -count=1 -run TestOptionalAuth`
Expected: Compilation fails — `OptionalAuth` doesn't exist yet.

- [ ] **Step 3: Implement OptionalAuth and GuestReadOnly**

Add to `server/internal/middleware/auth.go`:

```go
package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/razeencheng/xreader/internal/auth"
	"github.com/razeencheng/xreader/internal/guest"
)

// ... existing User struct and methods stay unchanged ...

func OptionalAuth(sessions auth.SessionStore, pool *pgxpool.Pool, guestSvc *guest.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, err := c.Cookie("xreader_session")
		if err == nil && cookie != "" {
			// Has session cookie — try normal auth
			userID, err := sessions.Get(c.Request.Context(), cookie)
			if err == nil {
				user, err := loadUser(c, pool, userID)
				if err == nil {
					// Check guest expiry
					if user.Role == "guest" && user.ExpiresAt != nil && time.Now().After(*user.ExpiresAt) {
						_ = sessions.Delete(c.Request.Context(), cookie)
						c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "guest session expired"})
						return
					}
					// Check guest mode still enabled for guest users
					if user.Role == "guest" {
						enabled, _ := guestSvc.IsEnabled(c.Request.Context())
						if !enabled {
							c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "guest mode disabled"})
							return
						}
					}
					_ = sessions.Touch(c.Request.Context(), cookie)
					c.Set("user", user)
					c.Next()
					return
				}
			}
		}

		// No valid session — try creating guest
		enabled, _ := guestSvc.IsEnabled(c.Request.Context())
		if !enabled {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}

		guestUser, err := guestSvc.CreateGuest(c.Request.Context())
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create guest"})
			return
		}

		sessionID, err := sessions.Create(c.Request.Context(), guestUser.ID, c.Request.UserAgent())
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to create session"})
			return
		}

		secure := c.Request.TLS != nil
		c.SetCookie("xreader_session", sessionID, 86400, "/", "", secure, true)

		user := &User{
			ID:             guestUser.ID,
			GitHubUsername: guestUser.Username,
			Role:           "guest",
			ExpiresAt:      &guestUser.ExpiresAt,
		}
		// Load full user to get defaults
		if loaded, err := loadUser(c, pool, guestUser.ID); err == nil {
			user = loaded
		}
		c.Set("user", user)
		c.Next()
	}
}

func GuestReadOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := GetUser(c)
		if user != nil && user.Role == "guest" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "guests cannot modify this resource"})
			return
		}
		c.Next()
	}
}
```

- [ ] **Step 4: Update the User struct to include ExpiresAt**

In `server/internal/middleware/auth.go`, update the User struct:

```go
type User struct {
	ID             int64      `json:"id"`
	GitHubID       *int64     `json:"github_id,omitempty"`
	GitHubUsername string     `json:"github_username"`
	AvatarURL      string     `json:"avatar_url,omitempty"`
	NativeLanguage string     `json:"native_language"`
	Role           string     `json:"role"`
	DensityPref    string     `json:"density_pref"`
	ThemePref      string     `json:"theme_pref"`
	ExpiresAt      *time.Time `json:"-"`
}
```

- [ ] **Step 5: Extract loadUser helper (used by both RequireAuth and OptionalAuth)**

```go
func loadUser(c *gin.Context, pool *pgxpool.Pool, userID int64) (*User, error) {
	var u User
	var avatarURL *string
	var githubID *int64
	var expiresAt *time.Time
	err := pool.QueryRow(c.Request.Context(),
		`SELECT id, github_id, github_username, avatar_url, native_language, role, density_pref, theme_pref, expires_at
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&u.ID, &githubID, &u.GitHubUsername, &avatarURL, &u.NativeLanguage, &u.Role, &u.DensityPref, &u.ThemePref, &expiresAt)
	if err != nil {
		return nil, err
	}
	u.GitHubID = githubID
	u.ExpiresAt = expiresAt
	if avatarURL != nil {
		u.AvatarURL = *avatarURL
	}
	return &u, nil
}
```

Update `RequireAuth` to use `loadUser` as well (keeping existing behavior, just DRY):

```go
func RequireAuth(sessions auth.SessionStore, pool *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		cookie, err := c.Cookie("xreader_session")
		if err != nil || cookie == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}
		userID, err := sessions.Get(c.Request.Context(), cookie)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "session expired"})
			return
		}
		user, err := loadUser(c, pool, userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}
		_ = sessions.Touch(c.Request.Context(), cookie)
		c.Set("user", user)
		c.Next()
	}
}
```

- [ ] **Step 6: Run tests**

Run: `cd server && go test ./internal/middleware/... -v -count=1`
Expected: All tests pass including the new OptionalAuth tests.

- [ ] **Step 7: Commit**

```bash
git add server/internal/middleware/
git commit -m "feat(middleware): add OptionalAuth and GuestReadOnly for guest mode"
```

---

## Task 4: Guest sqlc Queries

**Files:**
- Create: `server/db/queries/guest_articles.sql`
- Create: `server/db/queries/guest_states.sql`
- Modify: `server/db/queries/sources.sql` (add guest list query)

These are guest variants of existing queries that split `content_owner_id` (for source/article lookups) from `state_owner_id` (for article_states joins).

- [ ] **Step 1: Write guest article queries**

```sql
-- server/db/queries/guest_articles.sql

-- name: GuestListArticlesTodayEnriched :many
WITH ranked AS (
  SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
         COALESCE(ai.title_translated, '') AS title_translated,
         COALESCE(ai.summary, '') AS summary,
         s.title AS source_title,
         COALESCE(st.is_read, false) AS is_read,
         COALESCE(st.is_starred, false) AS is_starred,
         row_number() OVER (PARTITION BY a.normalized_link ORDER BY a.published_at DESC, a.id DESC) AS rn
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND a.published_at >= now() - interval '24 hours'
    AND (
      @read_filter::text = 'all'
      OR (@read_filter::text = 'unread' AND COALESCE(st.is_read, false) = false)
      OR (@read_filter::text = 'read' AND COALESCE(st.is_read, false) = true)
    )
)
SELECT id, source_id, title, link, language, author, published_at, content_text,
       title_translated, summary, source_title, is_read, is_starred
FROM ranked
WHERE rn = 1
ORDER BY published_at DESC, id DESC
LIMIT 100;

-- name: GuestListArticlesStreamEnriched :many
WITH ranked AS (
  SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
         COALESCE(ai.title_translated, '') AS title_translated,
         COALESCE(ai.summary, '') AS summary,
         s.title AS source_title,
         COALESCE(st.is_read, false) AS is_read,
         COALESCE(st.is_starred, false) AS is_starred,
         row_number() OVER (PARTITION BY a.normalized_link ORDER BY a.published_at DESC, a.id DESC) AS rn
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND (@cursor::timestamptz IS NULL OR a.published_at < @cursor)
    AND (
      @read_filter::text = 'all'
      OR (@read_filter::text = 'unread' AND COALESCE(st.is_read, false) = false)
      OR (@read_filter::text = 'read' AND COALESCE(st.is_read, false) = true)
    )
)
SELECT id, source_id, title, link, language, author, published_at, content_text,
       title_translated, summary, source_title, is_read, is_starred
FROM ranked
WHERE rn = 1
ORDER BY published_at DESC, id DESC
LIMIT @lim;

-- name: GuestListArticlesStarredEnriched :many
WITH ranked AS (
  SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
         COALESCE(ai.title_translated, '') AS title_translated,
         COALESCE(ai.summary, '') AS summary,
         s.title AS source_title,
         COALESCE(st.is_read, false) AS is_read,
         COALESCE(st.is_starred, false) AS is_starred,
         row_number() OVER (PARTITION BY a.normalized_link ORDER BY a.published_at DESC, a.id DESC) AS rn
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
  JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND st.is_starred = true
)
SELECT id, source_id, title, link, language, author, published_at, content_text,
       title_translated, summary, source_title, is_read, is_starred
FROM ranked
WHERE rn = 1
ORDER BY published_at DESC, id DESC
LIMIT 100;

-- name: GuestListArticlesBySourceEnriched :many
WITH ranked AS (
  SELECT a.id, a.source_id, a.title, a.link, a.language, a.author, a.published_at, a.content_text,
         COALESCE(ai.title_translated, '') AS title_translated,
         COALESCE(ai.summary, '') AS summary,
         s.title AS source_title,
         COALESCE(st.is_read, false) AS is_read,
         COALESCE(st.is_starred, false) AS is_starred,
         row_number() OVER (PARTITION BY a.normalized_link ORDER BY a.published_at DESC, a.id DESC) AS rn
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_ai ai ON ai.article_id = a.id AND ai.target_language = @target_language
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND a.source_id = @source_id
    AND s.deleted_at IS NULL
    AND (
      @read_filter::text = 'all'
      OR (@read_filter::text = 'unread' AND COALESCE(st.is_read, false) = false)
      OR (@read_filter::text = 'read' AND COALESCE(st.is_read, false) = true)
    )
)
SELECT id, source_id, title, link, language, author, published_at, content_text,
       title_translated, summary, source_title, is_read, is_starred
FROM ranked
WHERE rn = 1
ORDER BY published_at DESC, id DESC;

-- name: GuestSearchArticles :many
SELECT a.id, a.source_id, a.title, a.link, a.language, a.published_at,
       ts_headline('simple', a.title || ' ' || COALESCE(a.content_text, ''),
                   plainto_tsquery('simple', @q) || cjk_tsquery(@q),
                   'MaxWords=20, MinWords=6') AS headline
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE s.user_id = @content_owner_id
  AND s.deleted_at IS NULL
  AND a.search_vec @@ (plainto_tsquery('simple', @q) || cjk_tsquery(@q))
ORDER BY ts_rank(a.search_vec, plainto_tsquery('simple', @q) || cjk_tsquery(@q)) DESC
LIMIT 100;

-- name: GuestCountTodayByReadState :one
WITH grouped AS (
  SELECT a.normalized_link,
         bool_or(COALESCE(st.is_read, false) = false) AS has_unread
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND a.published_at >= now() - interval '24 hours'
  GROUP BY a.normalized_link
)
SELECT
  COUNT(*) AS all_count,
  COUNT(*) FILTER (WHERE has_unread) AS unread_count,
  COUNT(*) FILTER (WHERE NOT has_unread) AS read_count
FROM grouped;

-- name: GuestCountStreamByReadState :one
WITH grouped AS (
  SELECT a.normalized_link,
         bool_or(COALESCE(st.is_read, false) = false) AS has_unread
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
  GROUP BY a.normalized_link
)
SELECT
  COUNT(*) AS all_count,
  COUNT(*) FILTER (WHERE has_unread) AS unread_count,
  COUNT(*) FILTER (WHERE NOT has_unread) AS read_count
FROM grouped;

-- name: GuestCountBySourceReadState :one
SELECT
  COUNT(*) AS all_count,
  COUNT(*) FILTER (WHERE COALESCE(st.is_read, false) = false) AS unread_count,
  COUNT(*) FILTER (WHERE COALESCE(st.is_read, false) = true) AS read_count
FROM articles a
JOIN sources s ON a.source_id = s.id AND s.user_id = @content_owner_id AND s.deleted_at IS NULL
LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
WHERE a.source_id = @source_id;
```

- [ ] **Step 2: Write guest state queries**

```sql
-- server/db/queries/guest_states.sql

-- name: GuestSetArticleRead :one
INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
SELECT @state_owner_id, a.id, @is_read, now()
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = @article_id AND s.user_id = @content_owner_id AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_read = @is_read,
  last_read_at = now()
RETURNING article_id;

-- name: GuestSetArticleStarred :one
INSERT INTO article_states (user_id, article_id, is_starred)
SELECT @state_owner_id, a.id, @is_starred
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = @article_id AND s.user_id = @content_owner_id AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  is_starred = @is_starred
RETURNING article_id;

-- name: GuestUpdateReadingProgress :one
INSERT INTO article_states (user_id, article_id, reading_progress)
SELECT @state_owner_id, a.id, @reading_progress
FROM articles a
JOIN sources s ON a.source_id = s.id
WHERE a.id = @article_id AND s.user_id = @content_owner_id AND s.deleted_at IS NULL
ON CONFLICT (user_id, article_id) DO UPDATE SET
  reading_progress = @reading_progress
RETURNING article_id;

-- name: GuestBatchSetReadToday :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT @state_owner_id, a.id, @is_read, CASE WHEN @is_read THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id AND a.published_at >= now() - interval '24 hours'
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> @is_read
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = @is_read,
    last_read_at = CASE WHEN @is_read THEN now() ELSE NULL END
  RETURNING article_id
), changes AS (
  INSERT INTO article_state_changes (user_id, article_id)
  SELECT @state_owner_id, article_id FROM upserted
)
SELECT article_id FROM upserted;

-- name: GuestBatchSetReadStream :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT @state_owner_id, a.id, @is_read, CASE WHEN @is_read THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> @is_read
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = @is_read,
    last_read_at = CASE WHEN @is_read THEN now() ELSE NULL END
  RETURNING article_id
), changes AS (
  INSERT INTO article_state_changes (user_id, article_id)
  SELECT @state_owner_id, article_id FROM upserted
)
SELECT article_id FROM upserted;

-- name: GuestBatchSetReadBySource :many
WITH upserted AS (
  INSERT INTO article_states (user_id, article_id, is_read, last_read_at)
  SELECT @state_owner_id, a.id, @is_read, CASE WHEN @is_read THEN now() ELSE NULL END
  FROM articles a
  JOIN sources s ON a.source_id = s.id
  LEFT JOIN article_states st ON st.article_id = a.id AND st.user_id = @state_owner_id
  WHERE s.id = @source_id AND s.user_id = @content_owner_id
    AND s.deleted_at IS NULL
    AND COALESCE(st.is_read, false) <> @is_read
  ON CONFLICT (user_id, article_id) DO UPDATE SET
    is_read = @is_read,
    last_read_at = CASE WHEN @is_read THEN now() ELSE NULL END
  RETURNING article_id
), changes AS (
  INSERT INTO article_state_changes (user_id, article_id)
  SELECT @state_owner_id, article_id FROM upserted
)
SELECT article_id FROM upserted;
```

- [ ] **Step 3: Add guest source list query**

Append to `server/db/queries/sources.sql`:

```sql
-- name: GuestListSources :many
SELECT id, title, url, icon_url, language_hint, last_fetched_at, health, category, created_at
FROM sources
WHERE user_id = @content_owner_id AND deleted_at IS NULL
ORDER BY LOWER(title);
```

- [ ] **Step 4: Run sqlc generate**

Run: `cd server && make sqlc-generate`
Expected: Code generation succeeds with no errors.

- [ ] **Step 5: Verify generated code compiles**

Run: `cd server && go build ./...`
Expected: Compiles without errors.

- [ ] **Step 6: Commit**

```bash
git add server/db/queries/guest_articles.sql server/db/queries/guest_states.sql server/db/queries/sources.sql server/db/gen/
git commit -m "feat(db): add guest-mode sqlc queries with split owner/state parameters"
```

---

## Task 5: Article Service Guest Methods

**Files:**
- Modify: `server/internal/article/service.go`
- Modify: `server/internal/article/handler.go`

- [ ] **Step 1: Add guest methods to ArticleService**

Add to `server/internal/article/service.go`:

```go
// Guest variants — content from contentOwnerID, state from stateOwnerID
func (s *ArticleService) GuestListTodayEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesTodayEnriched(ctx, gen.GuestListArticlesTodayEnrichedParams{
		ContentOwnerID: contentOwnerID,
		StateOwnerID:   stateOwnerID,
		TargetLanguage: lang,
		ReadFilter:     normalizeReadFilter(readFilter),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListStreamEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, cursor *time.Time, limit int32, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesStreamEnriched(ctx, gen.GuestListArticlesStreamEnrichedParams{
		ContentOwnerID: contentOwnerID,
		StateOwnerID:   stateOwnerID,
		Cursor:         timestamptzOrNull(cursor),
		TargetLanguage: lang,
		Lim:            clampLimit(limit),
		ReadFilter:     normalizeReadFilter(readFilter),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListStarredEnriched(ctx context.Context, stateOwnerID, contentOwnerID int64, lang string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesStarredEnriched(ctx, gen.GuestListArticlesStarredEnrichedParams{
		ContentOwnerID: contentOwnerID,
		StateOwnerID:   stateOwnerID,
		TargetLanguage: lang,
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestListBySourceEnriched(ctx context.Context, stateOwnerID, contentOwnerID, sourceID int64, lang string, readFilter string) ([]EnrichedArticle, error) {
	rows, err := s.queries.GuestListArticlesBySourceEnriched(ctx, gen.GuestListArticlesBySourceEnrichedParams{
		ContentOwnerID: contentOwnerID,
		StateOwnerID:   stateOwnerID,
		SourceID:       sourceID,
		TargetLanguage: lang,
		ReadFilter:     normalizeReadFilter(readFilter),
	})
	if err != nil {
		return nil, err
	}
	out := make([]EnrichedArticle, len(rows))
	for i, r := range rows {
		out[i] = EnrichedArticle{
			ID: r.ID, SourceID: r.SourceID, Title: r.Title,
			TitleTranslated: r.TitleTranslated, Summary: r.Summary,
			SourceTitle: r.SourceTitle, Link: r.Link, Language: r.Language,
			Author: r.Author, PublishedAt: r.PublishedAt, ContentText: r.ContentText,
			IsRead: r.IsRead, IsStarred: r.IsStarred,
		}
	}
	return out, nil
}

func (s *ArticleService) GuestSearch(ctx context.Context, contentOwnerID int64, query string) ([]gen.Article, error) {
	return s.queries.GuestSearchArticles(ctx, gen.GuestSearchArticlesParams{
		ContentOwnerID: contentOwnerID,
		Q:              query,
	})
}

func (s *ArticleService) GuestGetByID(ctx context.Context, contentOwnerID, articleID int64) (ArticleWithSource, error) {
	article, err := s.queries.GetArticleByID(ctx, articleID)
	if err != nil {
		return ArticleWithSource{}, errNotFound
	}
	source, err := s.queries.GetSourceByID(ctx, article.SourceID)
	if err != nil || source.UserID != contentOwnerID {
		return ArticleWithSource{}, errNotFound
	}
	return ArticleWithSource{Article: article, SourceTitle: source.Title}, nil
}

func (s *ArticleService) GuestSetRead(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, isRead bool) error {
	return s.withTx(ctx, func(q *gen.Queries) error {
		_, err := q.GuestSetArticleRead(ctx, gen.GuestSetArticleReadParams{
			StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, ArticleID: articleID, IsRead: isRead,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return errForbidden
		}
		if err != nil {
			return err
		}
		return q.RecordStateChange(ctx, gen.RecordStateChangeParams{UserID: stateOwnerID, ArticleID: articleID})
	})
}

func (s *ArticleService) GuestSetStarred(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, isStarred bool) error {
	return s.withTx(ctx, func(q *gen.Queries) error {
		_, err := q.GuestSetArticleStarred(ctx, gen.GuestSetArticleStarredParams{
			StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, ArticleID: articleID, IsStarred: isStarred,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return errForbidden
		}
		if err != nil {
			return err
		}
		return q.RecordStateChange(ctx, gen.RecordStateChangeParams{UserID: stateOwnerID, ArticleID: articleID})
	})
}

func (s *ArticleService) GuestUpdateProgress(ctx context.Context, stateOwnerID, contentOwnerID, articleID int64, progress []byte) error {
	_, err := s.queries.GuestUpdateReadingProgress(ctx, gen.GuestUpdateReadingProgressParams{
		StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, ArticleID: articleID, ReadingProgress: progress,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return errForbidden
	}
	return err
}

func (s *ArticleService) GuestBatchSetRead(ctx context.Context, stateOwnerID, contentOwnerID int64, scope string, isRead bool) ([]int64, error) {
	scope = strings.TrimSpace(scope)
	if scope == "tab:today" {
		return s.queries.GuestBatchSetReadToday(ctx, gen.GuestBatchSetReadTodayParams{
			StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, IsRead: isRead,
		})
	}
	if scope == "tab:stream" || scope == "tab:all" {
		return s.queries.GuestBatchSetReadStream(ctx, gen.GuestBatchSetReadStreamParams{
			StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, IsRead: isRead,
		})
	}
	if after, ok := strings.CutPrefix(scope, "source:"); ok {
		sourceID, err := strconv.ParseInt(after, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid scope: %s", scope)
		}
		return s.queries.GuestBatchSetReadBySource(ctx, gen.GuestBatchSetReadBySourceParams{
			StateOwnerID: stateOwnerID, ContentOwnerID: contentOwnerID, SourceID: sourceID, IsRead: isRead,
		})
	}
	return nil, fmt.Errorf("unknown scope: %s", scope)
}

func (s *ArticleService) GuestCountTodayByReadState(ctx context.Context, stateOwnerID, contentOwnerID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountTodayByReadState(ctx, gen.GuestCountTodayByReadStateParams{
		ContentOwnerID: contentOwnerID, StateOwnerID: stateOwnerID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) GuestCountStreamByReadState(ctx context.Context, stateOwnerID, contentOwnerID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountStreamByReadState(ctx, gen.GuestCountStreamByReadStateParams{
		ContentOwnerID: contentOwnerID, StateOwnerID: stateOwnerID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}

func (s *ArticleService) GuestCountBySourceReadState(ctx context.Context, stateOwnerID, contentOwnerID, sourceID int64) (ArticleReadCounts, error) {
	row, err := s.queries.GuestCountBySourceReadState(ctx, gen.GuestCountBySourceReadStateParams{
		ContentOwnerID: contentOwnerID, StateOwnerID: stateOwnerID, SourceID: sourceID,
	})
	if err != nil {
		return ArticleReadCounts{}, err
	}
	return ArticleReadCounts{Unread: row.UnreadCount, All: row.AllCount, Read: row.ReadCount}, nil
}
```

- [ ] **Step 2: Update ArticleHandler to dispatch between normal and guest paths**

Add a `contentOwnerID` field and helper to `ArticleHandler`:

```go
type ArticleHandler struct {
	Service        *ArticleService
	ContentOwnerID func(ctx context.Context) (int64, error) // injected at router setup
}

func (h *ArticleHandler) resolveOwners(c *gin.Context) (stateOwnerID, contentOwnerID int64, isGuest bool) {
	user := middleware.GetUser(c)
	if user.Role == "guest" {
		adminID, err := h.ContentOwnerID(c.Request.Context())
		if err != nil {
			return user.ID, user.ID, false
		}
		return user.ID, adminID, true
	}
	return user.ID, user.ID, false
}
```

Update `itemsForList` and `countsForList` to use `resolveOwners` — dispatch to `Guest*` methods when `isGuest == true`.

- [ ] **Step 3: Verify compilation**

Run: `cd server && go build ./...`
Expected: Compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add server/internal/article/
git commit -m "feat(article): add guest service methods and handler dispatch"
```

---

## Task 6: Source & Highlight Ownership Adaptation

**Files:**
- Modify: `server/internal/source/handler.go`
- Modify: `server/internal/highlight/service.go`
- Modify: `server/internal/article/sse_handler.go`
- Modify: `server/internal/article/body_retry_handler.go`

- [ ] **Step 1: Update source handler List to support guest**

In `server/internal/source/handler.go`, modify `List`:

```go
func (h *SourceHandler) List(c *gin.Context) {
	user := middleware.GetUser(c)
	var sources []SourceListItem
	var err error
	if user.Role == "guest" {
		// Use guest query — reads admin's sources
		sources, err = h.Service.GuestList(c.Request.Context(), h.contentOwnerID(c))
	} else {
		sources, err = h.Service.List(c.Request.Context(), user.ID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list sources"})
		return
	}
	c.JSON(http.StatusOK, sources)
}
```

Add `contentOwnerID` resolver to `SourceHandler` (injected at setup).

- [ ] **Step 2: Update highlight service to accept contentOwnerID**

In `server/internal/highlight/service.go`, modify `Create` and `validateQuotedText`:

```go
func (s *HighlightService) Create(ctx context.Context, userID, contentOwnerID int64, params CreateParams) (*gen.Highlight, error) {
	// ... validation ...
	if err := s.validateQuotedText(ctx, contentOwnerID, params); err != nil {
		return nil, err
	}
	// ... create highlight with userID (guest's own) ...
}

func (s *HighlightService) validateQuotedText(ctx context.Context, contentOwnerID int64, params CreateParams) error {
	paragraphText, err := s.paragraphText(ctx, contentOwnerID, params)
	// ...
}

func (s *HighlightService) paragraphText(ctx context.Context, contentOwnerID int64, params CreateParams) (string, error) {
	article, err := s.queries.GetArticleByID(ctx, params.ArticleID)
	if err != nil {
		return "", errNotFound
	}
	source, err := s.queries.GetSourceByID(ctx, article.SourceID)
	if err != nil || source.UserID != contentOwnerID {
		return "", errNotFound
	}
	// ... rest unchanged ...
}
```

Update highlight handler to pass `contentOwnerID`:

```go
func (h *HighlightHandler) Create(c *gin.Context) {
	user := middleware.GetUser(c)
	contentOwnerID := user.ID
	if user.Role == "guest" {
		contentOwnerID = h.resolveContentOwner(c)
	}
	// ... call h.Service.Create(ctx, user.ID, contentOwnerID, params) ...
}
```

- [ ] **Step 3: Update SSE handler ownership check**

In `server/internal/article/sse_handler.go`, line 65:

```go
// Before:
// if err != nil || source.UserID != user.ID {

// After:
contentOwnerID := user.ID
if user.Role == "guest" {
    if id, err := h.contentOwnerID(ctx); err == nil {
        contentOwnerID = id
    }
}
if err != nil || source.UserID != contentOwnerID {
    c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
    return
}
```

- [ ] **Step 4: Update body retry handler ownership check**

In `server/internal/article/body_retry_handler.go`, line 41:

```go
// Same pattern as SSE handler
contentOwnerID := user.ID
if user.Role == "guest" {
    if id, err := h.contentOwnerID(ctx); err == nil {
        contentOwnerID = id
    }
}
if err != nil || source.UserID != contentOwnerID {
    c.JSON(http.StatusNotFound, gin.H{"error": "article not found"})
    return
}
```

- [ ] **Step 5: Verify compilation and run tests**

Run: `cd server && go build ./... && go test ./... -count=1`
Expected: All existing tests still pass + compiles cleanly.

- [ ] **Step 6: Commit**

```bash
git add server/internal/source/ server/internal/highlight/ server/internal/article/
git commit -m "feat(guest): adapt source, highlight, SSE handlers for guest content ownership"
```

---

## Task 7: Router Wiring + Guest API Endpoints

**Files:**
- Modify: `server/internal/platform/router.go`
- Create: `server/internal/guest/handler.go`

- [ ] **Step 1: Create guest handler (status + admin toggle)**

```go
// server/internal/guest/handler.go
package guest

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Public endpoint — no auth required
func (h *Handler) Status(c *gin.Context) {
	enabled, _ := h.svc.IsEnabled(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

// Admin-only endpoints
func (h *Handler) GetSettings(c *gin.Context) {
	enabled, _ := h.svc.IsEnabled(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"enabled": enabled})
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	val := "false"
	if req.Enabled {
		val = "true"
	}
	_, err := h.svc.pool.Exec(c.Request.Context(),
		"INSERT INTO settings (key, value) VALUES ('guest_mode_enabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()",
		val,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update setting"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"enabled": req.Enabled})
}
```

- [ ] **Step 2: Update router to use OptionalAuth + GuestReadOnly**

In `server/internal/platform/router.go`:

```go
func NewRouter(deps RouterDeps) *gin.Engine {
    // ... existing setup code ...

    // Guest mode service
    guestSvc := guest.NewService(deps.Pool)
    guestH := guest.NewHandler(guestSvc)

    // Public guest status endpoint
    r.GET("/api/guest/status", guestH.Status)

    // Auth-protected routes — replace RequireAuth with OptionalAuth
    authed := r.Group("/api")
    authed.Use(middleware.OptionalAuth(sessions, deps.Pool, guestSvc))
    authed.Use(middleware.RequireCSRF())
    {
        // ... existing routes ...

        // Sources — wrap mutations with GuestReadOnly
        authed.GET("/sources", sourceH.List)
        authed.POST("/sources", middleware.GuestReadOnly(), sourceH.Create)
        authed.PUT("/sources/:id", middleware.GuestReadOnly(), sourceH.Rename)
        authed.PATCH("/sources/:id/category", middleware.GuestReadOnly(), sourceH.UpdateCategory)
        authed.DELETE("/sources/:id", middleware.GuestReadOnly(), sourceH.Delete)
        authed.POST("/sources/import", middleware.GuestReadOnly(), sourceH.ImportOPML)
        // ... refresh, export, jobs stay open to guests ...

        // Fever password — block guests
        authed.POST("/users/me/fever", middleware.GuestReadOnly(), feverH.SetFeverPassword)

        // Admin routes — add guest settings
        adminGroup.GET("/settings/guest", guestH.GetSettings)
        adminGroup.PATCH("/settings/guest", guestH.UpdateSettings)
    }
}
```

- [ ] **Step 3: Inject contentOwnerID resolver into handlers**

Pass `guestSvc.ContentOwnerID` as a func to `ArticleHandler`, `SourceHandler`, `HighlightHandler`, `SSEHandler`, and `BodyRetryHandler` during router setup.

- [ ] **Step 4: Verify compilation**

Run: `cd server && go build ./...`
Expected: Compiles without errors.

- [ ] **Step 5: Run all backend tests**

Run: `cd server && go test ./... -count=1`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/internal/platform/router.go server/internal/guest/handler.go
git commit -m "feat(router): wire OptionalAuth, GuestReadOnly, and guest API endpoints"
```

---

## Task 8: Cleanup in Sync Worker

**Files:**
- Modify: `server/internal/sync/worker.go`

- [ ] **Step 1: Add cleanup goroutine to worker**

In `server/internal/sync/worker.go`, modify the `Run` method:

```go
func (w *Worker) Run(ctx context.Context) error {
	log.Println("worker: starting fetch loop")
	go w.catchUpAI(ctx)
	go w.guestCleanupLoop(ctx)  // NEW
	w.tick(ctx)
	// ... rest unchanged ...
}

func (w *Worker) guestCleanupLoop(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			guestSvc := guest.NewService(w.pool)
			cleaned, err := guestSvc.CleanupExpired(ctx)
			if err != nil {
				log.Printf("worker: guest cleanup error: %v", err)
			} else if cleaned > 0 {
				log.Printf("worker: cleaned up %d expired guest users", cleaned)
			}
		}
	}
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd server && go build ./...`
Expected: Compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add server/internal/sync/worker.go
git commit -m "feat(sync): add hourly guest cleanup goroutine"
```

---

## Task 9: Frontend — Auth Flow Update

**Files:**
- Modify: `web/src/lib/api-client.ts`
- Modify: `web/src/stores/useAuthStore.ts`
- Modify: `web/src/app/(app)/layout.tsx`

- [ ] **Step 1: Remove auto-redirect on 401 from api-client**

In `web/src/lib/api-client.ts`, change the 401 handling:

```typescript
if (res.status === 401) {
    // Don't auto-redirect — let the caller/layout handle navigation
    throw new ApiError(401, 'UNAUTHORIZED', 'Not authenticated');
}
```

- [ ] **Step 2: Update auth store with isGuest getter**

In `web/src/stores/useAuthStore.ts`:

```typescript
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  fetchMe: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  get isGuest() { return get().user?.role === 'guest'; },
  fetchMe: async () => {
    try {
      const user = await apiFetch<User>('/api/auth/me');
      set({ user, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      set({ user: null });
      window.location.href = '/login';
    }
  },
}));
```

Note: Since Zustand doesn't support getters in the `create` callback the standard way, use a derived selector instead:

```typescript
// Export a selector hook
export const useIsGuest = () => useAuthStore((s) => s.user?.role === 'guest');
```

- [ ] **Step 3: Update AppLayout to redirect only when guest mode is off**

In `web/src/app/(app)/layout.tsx`:

```typescript
useEffect(() => {
    if (!isLoading && !user) {
        router.replace('/login');
    }
}, [isLoading, router, user]);
```

This still works because: when guest mode is ON, `OptionalAuth` creates a guest user and sets cookie on the first `fetchMe()` call — so `user` will be set (role=guest). When guest mode is OFF, `fetchMe()` gets 401 → `user` stays null → redirect to `/login`.

No change needed here actually! The backend handles it.

- [ ] **Step 4: Verify frontend builds**

Run: `cd web && pnpm build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api-client.ts web/src/stores/useAuthStore.ts web/src/app/\(app\)/layout.tsx
git commit -m "feat(web): update auth flow for guest mode — remove 401 auto-redirect"
```

---

## Task 10: Frontend — Guest UI Conditions

**Files:**
- Modify: `web/src/components/layout/ResponsiveAppNav.tsx`
- Modify: `web/src/app/(app)/sources/page.tsx`
- Modify: `web/src/app/(app)/settings/page.tsx`
- Create: `web/src/components/layout/GuestBanner.tsx`

- [ ] **Step 1: Hide admin nav for guests**

In `web/src/components/layout/ResponsiveAppNav.tsx`, the existing `isAdmin` check already hides admin nav. Guests with `role=guest` won't match `role === 'admin'`. No change needed.

- [ ] **Step 2: Hide source mutation buttons for guests**

In `web/src/app/(app)/sources/page.tsx`, use `useIsGuest` to conditionally render add/import/delete buttons:

```typescript
import { useIsGuest } from '@/stores/useAuthStore';

// Inside component:
const isGuest = useIsGuest();

// Wrap add/import buttons:
{!isGuest && (
    <button ...>Add Source</button>
)}

// Wrap delete button in source row:
{!isGuest && (
    <button onClick={() => onDelete(source)}>...</button>
)}
```

- [ ] **Step 3: Hide Fever section for guests in settings**

In `web/src/app/(app)/settings/page.tsx`:

```typescript
import { useIsGuest } from '@/stores/useAuthStore';

const isGuest = useIsGuest();

// Wrap Fever section:
{!isGuest && (
    <section>
        {/* Fever password UI */}
    </section>
)}
```

- [ ] **Step 4: Create GuestBanner component**

```typescript
// web/src/components/layout/GuestBanner.tsx
'use client';

import { useState } from 'react';
import { useIsGuest } from '@/stores/useAuthStore';
import { useI18n } from '@/lib/i18n';

export function GuestBanner() {
  const isGuest = useIsGuest();
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('guest_banner_dismissed') === 'true';
  });

  if (!isGuest || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-2 bg-[var(--bg-elevated)] px-4 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
      <span>
        {t('guest.banner')} ·{' '}
        <a href="/login" className="underline hover:text-[var(--text-body)]">
          {t('guest.signIn')}
        </a>
      </span>
      <button
        onClick={() => {
          setDismissed(true);
          localStorage.setItem('guest_banner_dismissed', 'true');
        }}
        className="text-[var(--text-muted)] hover:text-[var(--text-body)]"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add GuestBanner to AppLayout**

In `web/src/app/(app)/layout.tsx`, add at the top of the return:

```typescript
import { GuestBanner } from '@/components/layout/GuestBanner';

// In the return:
return (
    <div className="flex h-dvh flex-col overflow-hidden ...">
      <GuestBanner />
      <TabletTopNav ... />
      {/* ... rest ... */}
    </div>
);
```

- [ ] **Step 6: Add i18n keys**

In `web/src/lib/i18n.ts`, add:

```typescript
// English
'guest.banner': 'Guest Mode · Data expires in 24h',
'guest.signIn': 'Sign in with GitHub',

// Chinese
'guest.banner': '访客模式 · 数据 24 小时后清除',
'guest.signIn': '使用 GitHub 登录',
```

- [ ] **Step 7: Verify frontend builds and lint**

Run: `cd web && pnpm build && pnpm lint`
Expected: Build and lint pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/layout/GuestBanner.tsx web/src/components/layout/ResponsiveAppNav.tsx web/src/app/\(app\)/sources/page.tsx web/src/app/\(app\)/settings/page.tsx web/src/app/\(app\)/layout.tsx web/src/lib/i18n.ts web/src/stores/useAuthStore.ts
git commit -m "feat(web): add guest mode UI — banner, conditional buttons, i18n"
```

---

## Task 11: Admin Settings UI for Guest Mode Toggle

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx` (or admin page)

- [ ] **Step 1: Add guest mode toggle to admin settings**

Add a toggle in the admin section of the settings page (or the admin page):

```typescript
// In the admin settings area
const { data: guestSettings, refetch } = useQuery({
  queryKey: ['guest-settings'],
  queryFn: () => apiFetch<{ enabled: boolean }>('/api/settings/guest'),
  enabled: user?.role === 'admin',
});

const toggleGuestMode = useMutation({
  mutationFn: (enabled: boolean) =>
    apiFetch('/api/settings/guest', {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  onSuccess: () => refetch(),
});
```

Render as a simple toggle switch with label "Guest Mode" / "访客模式".

- [ ] **Step 2: Verify frontend builds**

Run: `cd web && pnpm build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/\(app\)/settings/page.tsx
git commit -m "feat(web): add guest mode toggle in admin settings"
```

---

## Task 12: Integration Test — Full Guest Flow

**Files:**
- Create: `server/internal/guest/integration_test.go`

- [ ] **Step 1: Write end-to-end test**

```go
// server/internal/guest/integration_test.go
package guest_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/razeencheng/xreader/internal/platform"
	"github.com/razeencheng/xreader/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGuestFlowIntegration(t *testing.T) {
	pool := testutil.SetupTestDB(t)
	ctx := context.Background()

	// Setup: enable guest mode + create admin + add a source with articles
	_, _ = pool.Exec(ctx, "INSERT INTO settings (key, value) VALUES ('guest_mode_enabled', 'true')")
	_, _ = pool.Exec(ctx,
		`INSERT INTO users (github_id, github_username, role, native_language, density_pref, theme_pref)
		 VALUES (1001, 'testadmin', 'admin', 'zh-CN', 'comfortable', 'system')`)

	var adminID int64
	_ = pool.QueryRow(ctx, "SELECT id FROM users WHERE github_username = 'testadmin'").Scan(&adminID)

	// Create a source for admin
	_, _ = pool.Exec(ctx,
		`INSERT INTO sources (user_id, kind, url, normalized_url, title)
		 VALUES ($1, 'rss', 'https://example.com/feed', 'example.com/feed', 'Test Feed')`, adminID)

	var sourceID int64
	_ = pool.QueryRow(ctx, "SELECT id FROM sources WHERE user_id = $1", adminID).Scan(&sourceID)

	// Create an article
	_, _ = pool.Exec(ctx,
		`INSERT INTO articles (source_id, external_id, link, normalized_link, title, language, content_html, content_text, published_at)
		 VALUES ($1, 'ext1', 'https://example.com/1', 'example.com/1', 'Test Article', 'en', '<p>Hello</p>', 'Hello', now())`, sourceID)

	// Build router
	router := platform.NewRouter(platform.RouterDeps{
		Pool:          pool,
		SessionSecret: "test-secret-at-least-32-chars-long!!",
	})

	// 1. GET /api/guest/status → enabled
	req := httptest.NewRequest("GET", "/api/guest/status", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	assert.Contains(t, w.Body.String(), `"enabled":true`)

	// 2. GET /api/articles (no cookie) → should create guest + return articles
	req = httptest.NewRequest("GET", "/api/articles", nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	assert.Contains(t, w.Body.String(), "Test Article")

	// Grab the session cookie for further requests
	cookies := w.Result().Cookies()
	require.NotEmpty(t, cookies)
	sessionCookie := cookies[0]

	// 3. GET /api/sources → should return admin's sources
	req = httptest.NewRequest("GET", "/api/sources", nil)
	req.AddCookie(sessionCookie)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	assert.Contains(t, w.Body.String(), "Test Feed")

	// 4. POST /sources (create) → 403
	req = httptest.NewRequest("POST", "/api/sources", nil)
	req.AddCookie(sessionCookie)
	req.Header.Set("X-Requested-With", "xhr")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)
	assert.Equal(t, 403, w.Code)
}
```

- [ ] **Step 2: Run integration test**

Run: `cd server && go test ./internal/guest/... -v -count=1 -run TestGuestFlowIntegration`
Expected: Test passes.

- [ ] **Step 3: Commit**

```bash
git add server/internal/guest/integration_test.go
git commit -m "test(guest): add integration test for full guest flow"
```

---

## Task 13: Manual E2E Verification

- [ ] **Step 1: Start the full stack**

```bash
make up
cd server && go run ./cmd/xreader
# In another terminal:
cd web && pnpm dev
```

- [ ] **Step 2: Enable guest mode via admin**

Log in as admin → Settings → Enable Guest Mode toggle.

- [ ] **Step 3: Test in incognito browser**

Open `http://localhost:3000` in an incognito window (no cookies):
- Should see articles without login
- Should see guest banner at top
- Mark an article as read → state persists within session
- Try to add a source → button should not be visible
- Check the admin window → admin's read states should be unaffected

- [ ] **Step 4: Verify cleanup**

```bash
psql $DATABASE_URL -c "SELECT id, github_username, expires_at FROM users WHERE role = 'guest'"
```

Manually set `expires_at` to past and trigger cleanup (or wait for the hourly tick):

```bash
psql $DATABASE_URL -c "UPDATE users SET expires_at = now() - interval '1 hour' WHERE role = 'guest'"
# Wait for cleanup or manually call the function
```

- [ ] **Step 5: Commit any fixes found during manual testing**

---

## Summary

| Task | Description | Estimated Effort |
|------|-------------|-----------------|
| 1 | Database migration | 5 min |
| 2 | Guest service (core logic) | 15 min |
| 3 | OptionalAuth + GuestReadOnly middleware | 20 min |
| 4 | Guest sqlc queries | 15 min |
| 5 | Article service guest methods | 25 min |
| 6 | Source/Highlight/SSE ownership adaptation | 20 min |
| 7 | Router wiring + guest API endpoints | 15 min |
| 8 | Cleanup in sync worker | 5 min |
| 9 | Frontend auth flow update | 10 min |
| 10 | Frontend guest UI conditions | 15 min |
| 11 | Admin settings UI toggle | 10 min |
| 12 | Integration test | 15 min |
| 13 | Manual E2E verification | 15 min |

**Total: ~3 hours**
