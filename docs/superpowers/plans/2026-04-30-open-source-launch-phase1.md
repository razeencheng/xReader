# Phase 1: Single Binary Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate xReader from 5 containers (Next.js + Go API + Go Worker + Postgres + Redis) to 2 containers (single Go binary + Postgres).

**Architecture:** Merge `cmd/api` and `cmd/worker` into `cmd/xreader`. Replace Redis session/state stores with Postgres-backed and cookie-based alternatives. Build Next.js as static export and embed in the Go binary via `//go:embed`. Add a Setup Wizard for first-run configuration.

**Tech Stack:** Go 1.25, Gin, pgx, Next.js 15 (static export), `embed` package

**Design spec:** `docs/superpowers/specs/2026-04-30-xreader-open-source-launch-design.md`

---

## Task 1: Create Postgres Session Store

Replace `RedisSessionStore` with a `PgSessionStore` that uses the existing `auth_sessions` table.

**Files:**
- Create: `server/internal/auth/pg_session_store.go`
- Create: `server/internal/auth/pg_session_store_test.go`
- Modify: `server/internal/auth/session.go` (keep interface, remove Redis impl)

### Steps

- [ ] **Step 1: Write failing test for PgSessionStore.Create**

```go
// server/internal/auth/pg_session_store_test.go
package auth_test

import (
	"context"
	"testing"

	"github.com/jin/xreader-web/internal/auth"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPgSessionStore_Create(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	store := auth.NewPgSessionStore(pool)
	ctx := context.Background()

	sid, err := store.Create(ctx, 1, "test-agent")
	require.NoError(t, err)
	assert.Len(t, sid, 64) // 32 bytes hex-encoded
}

func TestPgSessionStore_Get(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	store := auth.NewPgSessionStore(pool)
	ctx := context.Background()

	sid, err := store.Create(ctx, 42, "test-agent")
	require.NoError(t, err)

	userID, err := store.Get(ctx, sid)
	require.NoError(t, err)
	assert.Equal(t, int64(42), userID)
}

func TestPgSessionStore_Get_NotFound(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	store := auth.NewPgSessionStore(pool)
	ctx := context.Background()

	_, err := store.Get(ctx, "nonexistent")
	assert.Error(t, err)
}

func TestPgSessionStore_Delete(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	store := auth.NewPgSessionStore(pool)
	ctx := context.Background()

	sid, err := store.Create(ctx, 1, "test-agent")
	require.NoError(t, err)

	err = store.Delete(ctx, sid)
	require.NoError(t, err)

	_, err = store.Get(ctx, sid)
	assert.Error(t, err)
}

func TestPgSessionStore_Touch(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	store := auth.NewPgSessionStore(pool)
	ctx := context.Background()

	sid, err := store.Create(ctx, 1, "test-agent")
	require.NoError(t, err)

	err = store.Touch(ctx, sid)
	require.NoError(t, err)

	// Still accessible after touch
	userID, err := store.Get(ctx, sid)
	require.NoError(t, err)
	assert.Equal(t, int64(1), userID)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/auth/... -run TestPgSessionStore -v -count=1`
Expected: FAIL — `NewPgSessionStore` not defined

- [ ] **Step 3: Implement PgSessionStore**

```go
// server/internal/auth/pg_session_store.go
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionTTL = 30 * 24 * time.Hour

type PgSessionStore struct {
	pool *pgxpool.Pool
}

func NewPgSessionStore(pool *pgxpool.Pool) *PgSessionStore {
	return &PgSessionStore{pool: pool}
}

func (s *PgSessionStore) Create(ctx context.Context, userID int64, userAgent string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	sid := hex.EncodeToString(b)

	_, err := s.pool.Exec(ctx,
		`INSERT INTO auth_sessions (id, user_id, user_agent, created_at, last_seen_at)
		 VALUES ($1, $2, $3, NOW(), NOW())`,
		sid, userID, userAgent)
	if err != nil {
		return "", err
	}
	return sid, nil
}

func (s *PgSessionStore) Get(ctx context.Context, sessionID string) (int64, error) {
	var userID int64
	err := s.pool.QueryRow(ctx,
		`SELECT user_id FROM auth_sessions
		 WHERE id = $1 AND last_seen_at > NOW() - INTERVAL '30 days'`,
		sessionID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errors.New("session not found")
	}
	return userID, err
}

func (s *PgSessionStore) Delete(ctx context.Context, sessionID string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM auth_sessions WHERE id = $1`, sessionID)
	return err
}

func (s *PgSessionStore) Touch(ctx context.Context, sessionID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE auth_sessions SET last_seen_at = NOW() WHERE id = $1`,
		sessionID)
	return err
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && go test ./internal/auth/... -run TestPgSessionStore -v -count=1`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```
feat(auth): add Postgres-backed session store

Replaces Redis session storage with direct Postgres queries on
the existing auth_sessions table. Sessions expire after 30 days
based on last_seen_at timestamp.
```

---

## Task 2: Replace CSRF State Store with Cookie-Based HMAC

Replace `RedisStateStore` with a stateless cookie-based approach using HMAC.

**Files:**
- Create: `server/internal/auth/cookie_state.go`
- Create: `server/internal/auth/cookie_state_test.go`
- Modify: `server/internal/auth/state_store.go` (keep interface for reference, then remove)

### Steps

- [ ] **Step 1: Write failing test**

```go
// server/internal/auth/cookie_state_test.go
package auth_test

import (
	"testing"
	"time"

	"github.com/jin/xreader-web/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCookieState_GenerateAndVerify(t *testing.T) {
	secret := "test-secret-key-32-bytes-long!!"
	cs := auth.NewCookieState(secret)

	state, err := cs.Generate()
	require.NoError(t, err)
	assert.NotEmpty(t, state)

	// Same value in query param and cookie → valid
	ok := cs.Verify(state, state)
	assert.True(t, ok)
}

func TestCookieState_Verify_Invalid(t *testing.T) {
	secret := "test-secret-key-32-bytes-long!!"
	cs := auth.NewCookieState(secret)

	assert.False(t, cs.Verify("garbage", "garbage"))
	assert.False(t, cs.Verify("", ""))
}

func TestCookieState_Verify_Mismatch(t *testing.T) {
	secret := "test-secret-key-32-bytes-long!!"
	cs := auth.NewCookieState(secret)

	state, err := cs.Generate()
	require.NoError(t, err)

	// Different cookie value → rejected (prevents session swapping)
	assert.False(t, cs.Verify(state, "different-cookie-value"))
}

func TestCookieState_Verify_Expired(t *testing.T) {
	secret := "test-secret-key-32-bytes-long!!"
	cs := auth.NewCookieStateWithTTL(secret, 1*time.Millisecond)

	state, err := cs.Generate()
	require.NoError(t, err)

	time.Sleep(5 * time.Millisecond)
	assert.False(t, cs.Verify(state, state))
}

func TestCookieState_Verify_WrongSecret(t *testing.T) {
	cs1 := auth.NewCookieState("secret-one-32-bytes-long!!!!!!!!")
	cs2 := auth.NewCookieState("secret-two-32-bytes-long!!!!!!!!")

	state, err := cs1.Generate()
	require.NoError(t, err)

	assert.False(t, cs2.Verify(state, state))
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/auth/... -run TestCookieState -v -count=1`
Expected: FAIL — `NewCookieState` not defined

- [ ] **Step 3: Implement CookieState**

```go
// server/internal/auth/cookie_state.go
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

type CookieState struct {
	secret []byte
	ttl    time.Duration
}

func NewCookieState(secret string) *CookieState {
	return &CookieState{secret: []byte(secret), ttl: 10 * time.Minute}
}

func NewCookieStateWithTTL(secret string, ttl time.Duration) *CookieState {
	return &CookieState{secret: []byte(secret), ttl: ttl}
}

// Generate creates a state token and returns (stateParam, cookieValue).
// BeginLogin must set the cookieValue as an HttpOnly, SameSite=Lax cookie;
// Callback must compare the query ?state with the cookie value, then clear it.
func (cs *CookieState) Generate() (string, error) {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	nonceHex := hex.EncodeToString(nonce)
	ts := strconv.FormatInt(time.Now().UnixMilli(), 10)
	payload := nonceHex + "." + ts
	sig := cs.sign(payload)
	return payload + "." + sig, nil
}

// Verify checks that stateParam matches cookieValue (binding the state
// to the browser that started the flow) and that the token hasn't expired.
func (cs *CookieState) Verify(stateParam, cookieValue string) bool {
	if stateParam == "" || stateParam != cookieValue {
		return false
	}
	parts := strings.SplitN(stateParam, ".", 3)
	if len(parts) != 3 {
		return false
	}
	payload := parts[0] + "." + parts[1]
	sig := parts[2]

	if !hmac.Equal([]byte(cs.sign(payload)), []byte(sig)) {
		return false
	}

	ts, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return false
	}
	created := time.UnixMilli(ts)
	return time.Since(created) <= cs.ttl
}

func (cs *CookieState) sign(payload string) string {
	mac := hmac.New(sha256.New, cs.secret)
	fmt.Fprint(mac, payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// Integration in auth.Service / auth.Handler:
//
// BeginLogin:
//   state, _ := cookieState.Generate()
//   c.SetCookie("xreader_oauth_state", state, 600, "/", "", secure, true) // HttpOnly, SameSite=Lax
//   redirectURL := github.AuthCodeURL(state)
//
// HandleCallback:
//   stateParam := c.Query("state")
//   cookieVal, _ := c.Cookie("xreader_oauth_state")
//   if !cookieState.Verify(stateParam, cookieVal) { return 403 }
//   c.SetCookie("xreader_oauth_state", "", -1, "/", "", secure, true) // clear
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && go test ./internal/auth/... -run TestCookieState -v -count=1`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```
feat(auth): add stateless HMAC-based OAuth state verification

Replaces Redis-stored CSRF state tokens with a stateless approach:
nonce + timestamp signed with HMAC-SHA256. Tokens expire after 10
minutes without requiring server-side storage.
```

---

## Task 3: Wire PgSessionStore and CookieState into Auth Service

Replace Redis dependencies in the auth package and router.

**Files:**
- Modify: `server/internal/auth/service.go`
- Modify: `server/internal/auth/handler.go`
- Modify: `server/internal/platform/router.go`
- Modify: `server/internal/auth/session.go` (remove RedisSessionStore)
- Delete: `server/internal/auth/state_store.go` (remove RedisStateStore)

### Steps

- [ ] **Step 1: Update auth.Service to accept CookieState instead of StateStore**

In `server/internal/auth/service.go`, change the `Service` struct:

```go
// Replace:
//   stateStore StateStore
// With:
//   cookieState *CookieState

// Update NewService signature:
func NewService(github GitHubClient, users *PgUserStore, allowlist *admin.AllowlistService, cookieState *CookieState) *Service {

// Update BeginLogin to use cookieState.Generate() instead of stateStore.Save()
// Update Callback to use cookieState.Verify() instead of stateStore.Verify()
```

- [ ] **Step 2: Update auth.Handler to accept SessionStore interface (now backed by Postgres)**

In `server/internal/auth/handler.go`, no changes needed to the handler itself — it already depends on `SessionStore` interface. Just ensure `NewHandler` receives a `PgSessionStore` (which implements `SessionStore`).

- [ ] **Step 3: Update RouterDeps to remove Redis**

In `server/internal/platform/router.go`:

```go
// Replace:
type RouterDeps struct {
    Pool  *pgxpool.Pool
    Redis *redis.Client
}
// With:
type RouterDeps struct {
    Pool          *pgxpool.Pool
    SessionSecret string
}

// In NewRouter(), replace:
//   sessions := auth.NewRedisSessionStore(deps.Redis, deps.Pool)
//   stateStore := auth.NewRedisStateStore(deps.Redis)
// With:
//   sessions := auth.NewPgSessionStore(deps.Pool)
//   cookieState := auth.NewCookieState(deps.SessionSecret)

// Update auth.NewService call to pass cookieState instead of stateStore
```

- [ ] **Step 4: Remove Redis session and state store files**

Delete `RedisSessionStore` from `server/internal/auth/session.go` (keep the `SessionStore` interface).
Delete `server/internal/auth/state_store.go` entirely.

- [ ] **Step 5: Remove redis dependency from go.mod**

Run: `cd server && go mod tidy`

Verify `github.com/redis/go-redis/v9` is removed from `go.mod`.

- [ ] **Step 6: Run all auth tests**

Run: `cd server && go test ./internal/auth/... -v -count=1`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `cd server && go test ./... -count=1`
Expected: All tests PASS (no remaining Redis references)

- [ ] **Step 8: Commit**

```
refactor(auth): remove Redis dependency

Wire PgSessionStore and CookieState into the auth service and
router. Remove RedisSessionStore, RedisStateStore, and the
go-redis dependency entirely.
```

---

## Task 4: Merge cmd/api + cmd/worker into cmd/xreader

Create a single entry point that runs both HTTP server and worker in parallel goroutines.

**Files:**
- Create: `server/cmd/xreader/main.go`
- Delete: `server/cmd/api/main.go`
- Delete: `server/cmd/worker/main.go`

### Steps

- [ ] **Step 1: Create cmd/xreader/main.go**

```go
// server/cmd/xreader/main.go
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jin/xreader-web/internal/ai"
	"github.com/jin/xreader-web/internal/platform"
	"github.com/jin/xreader-web/internal/source"
	"github.com/jin/xreader-web/internal/sync"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	sessionSecret := os.Getenv("SESSION_SECRET")
	if sessionSecret == "" {
		sessionSecret = "change-me-to-a-random-string"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Seed-admin subcommand
	if len(os.Args) > 1 && os.Args[1] == "seed-admin" {
		runSeedAdmin(ctx, pool)
		return
	}

	// Start worker
	aiSettings := ai.NewSettingsService(ai.NewPostgresSettingsRepository(pool))
	aiClient := ai.NewDynamicClient(aiSettings)
	rssAdapter := source.NewRSSAdapter()
	worker := sync.NewWorker(pool, rssAdapter, aiClient)

	go func() {
		log.Println("worker: starting fetch loop")
		worker.Run(ctx)
	}()

	// Start HTTP server
	router := platform.NewRouter(platform.RouterDeps{
		Pool:          pool,
		SessionSecret: sessionSecret,
	})

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	go func() {
		log.Printf("http: listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("http server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("http server shutdown error: %v", err)
	}
	log.Println("shutdown complete")
}

func runSeedAdmin(ctx context.Context, pool *pgxpool.Pool) {
	var username string
	for i, arg := range os.Args {
		if arg == "--github-username" && i+1 < len(os.Args) {
			username = os.Args[i+1]
		}
		if len(arg) > 18 && arg[:18] == "--github-username=" {
			username = arg[18:]
		}
	}
	if username == "" {
		fmt.Fprintln(os.Stderr, "usage: xreader seed-admin --github-username=NAME")
		os.Exit(1)
	}

	// Reuse existing seed-admin logic from admin package
	adminSvc := newAdminService(pool)
	if err := adminSvc.SeedAdmin(ctx, username); err != nil {
		log.Fatalf("seed-admin failed: %v", err)
	}
	fmt.Printf("Admin seeded: %s\n", username)
}
```

Note: `newAdminService` should be extracted from the router setup to avoid duplication. Alternatively, inline the `AllowlistService` creation here — follow the existing pattern in `platform/router.go`.

- [ ] **Step 2: Delete old entry points**

```bash
rm server/cmd/api/main.go && rmdir server/cmd/api
rm server/cmd/worker/main.go && rmdir server/cmd/worker
```

- [ ] **Step 3: Update Makefile**

Replace all references to `cmd/api` and `cmd/worker` with `cmd/xreader`:

```makefile
build:
	cd server && go build ./... && cd ../web && pnpm build

seed-admin:
	cd server && go run ./cmd/xreader seed-admin --github-username=$${GH_USER}
```

- [ ] **Step 4: Verify build**

Run: `cd server && go build -o /dev/null ./cmd/xreader`
Expected: Build succeeds

- [ ] **Step 5: Run full test suite**

Run: `cd server && go test ./... -count=1`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```
refactor: merge api + worker into single binary cmd/xreader

Single process runs both the HTTP server and the RSS fetch/AI
worker loop as parallel goroutines. Graceful shutdown via
signal handling stops both. seed-admin remains as a subcommand.
```

---

## Task 5: Remove Redis from docker-compose

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

### Steps

- [ ] **Step 1: Update docker-compose.yml**

Remove the `redis` service, `redisdata` volume, and all `REDIS_URL` environment variables. Update `api` service to `xreader`, point build to single binary. Remove separate `worker` and `web` services.

For now, keep the `web` service — we'll remove it in Task 7 after static export is done. Update `api` → `xreader`:

```yaml
services:
  xreader:
    build: ./server
    command: ["/app/xreader"]
    ports:
      - "8080:3000"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: ${DATABASE_URL_DOCKER:-postgres://xreader:xreader@postgres:5432/xreader?sslmode=disable}
      SESSION_SECRET: ${SESSION_SECRET}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      GITHUB_CALLBACK_URL: ${GITHUB_CALLBACK_URL:-http://localhost:3000/api/auth/callback}

  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: xreader
      POSTGRES_PASSWORD: xreader
      POSTGRES_DB: xreader
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U xreader"]
      interval: 5s
      timeout: 3s
      retries: 5

  web:
    build:
      context: ./web
      args:
        API_PROXY_TARGET: "http://xreader:3000"
    ports:
      - "3000:3000"
    depends_on:
      - xreader

volumes:
  pgdata: {}
```

- [ ] **Step 2: Update .env.example — remove REDIS_URL**

- [ ] **Step 3: Update server/Dockerfile — build cmd/xreader instead of cmd/api**

Change the `go build` target from `./cmd/api` and `./cmd/worker` to just `./cmd/xreader`.

- [ ] **Step 4: Commit**

```
refactor: remove Redis from docker-compose

Single xreader binary replaces separate api and worker containers.
Redis service and volume removed entirely.
```

---

## Task 6: Eliminate Dynamic Routes + Next.js Static Export

Convert `/read/[id]` dynamic route to query-param routing (already used by the main feed page), then enable static export.

**Current state:** The app has TWO routing patterns for articles:
- `page.tsx` (main feed): uses `/?article=N&ctx=today` with inline `ArticleView`
- `read/[id]/page.tsx`: uses `/read/123?ctx=today` with standalone reader

Static export cannot generate `/read/[id]` for arbitrary article IDs (no `generateStaticParams`). The solution is to unify on the query-param approach.

**Files:**
- Delete: `web/src/app/(app)/read/[id]/page.tsx`
- Modify: `web/src/components/reader/PrevNextBar.tsx` (change `/read/ID` → `/?article=ID`)
- Modify: `web/src/components/reader/NextUpCard.tsx` (same)
- Modify: `web/src/components/highlights/HighlightsList.tsx` (change `/read/ID` → `/?article=ID`)
- Modify: `web/next.config.ts`

### Steps

- [ ] **Step 1: Migrate all `/read/ID` references to `/?article=ID`**

In `PrevNextBar.tsx`, find the link builder function:
```typescript
// Replace: return query ? `/read/${articleId}?${query}` : `/read/${articleId}`;
// With:
const params = new URLSearchParams();
params.set('article', String(articleId));
if (query) { for (const [k,v] of new URLSearchParams(query)) params.set(k,v); }
return `/?${params.toString()}`;
```

In `NextUpCard.tsx`, same pattern:
```typescript
// Replace: return query ? `/read/${articleId}?${query}` : `/read/${articleId}`;
// With same query-param builder as PrevNextBar
```

In `HighlightsList.tsx`:
```typescript
// Replace: href={`/read/${h.article_id}#highlight-${h.id}`}
// With:    href={`/?article=${h.article_id}#highlight-${h.id}`}
```

- [ ] **Step 2: Delete the standalone reader route**

```bash
rm -rf web/src/app/\(app\)/read/
```

The main `page.tsx` already handles `?article=N` via the inline `ArticleView` component.

- [ ] **Step 3: Run frontend tests**

Run: `cd web && pnpm vitest run`
Expected: All tests pass. Fix any test references to `/read/`.

- [ ] **Step 4: Update next.config.ts for static export**

```typescript
// web/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Remove any rewrites() or redirects() that proxy to the Go API
};

export default nextConfig;
```

- [ ] **Step 5: Run static export build**

Run: `cd web && pnpm build`
Expected: Build succeeds, `web/out/` directory created with static HTML/JS/CSS.

If it fails, common issues:
- `useSearchParams` without `Suspense` boundary — already handled in the codebase
- `next/image` without `unoptimized` — fixed by config above
- Middleware — remove if present

- [ ] **Step 6: Verify all pages exist in static export**

Run: `ls web/out/ && ls web/out/login/ web/out/settings/ web/out/sources/ web/out/highlights/ web/out/admin/ 2>/dev/null`

Expected: `index.html` at root and in each route directory. No `read/` directory (dynamic route eliminated). Article reading handled by client-side router on the main page via `?article=N`.

- [ ] **Step 7: Commit**

```
refactor(web): unify article routing to query-param pattern

Eliminate /read/[id] dynamic route in favor of /?article=ID (already
used by the main feed page). This enables Next.js static export —
no dynamic routes that require generateStaticParams. PrevNextBar,
NextUpCard, and HighlightsList updated to use the new pattern.

feat(web): convert to static export for Go embedding

Next.js now outputs static HTML/JS/CSS to web/out/ instead of a
standalone Node.js server. All pages remain client-side rendered.
Image optimization disabled (handled by Go image proxy).
```

---

## Task 7: Go Embed Static Files + SPA Fallback

Embed the Next.js static export into the Go binary and serve it.

**Files:**
- Create: `server/internal/platform/static.go`
- Modify: `server/internal/platform/router.go` (add static file serving)
- Create: `server/static/` (symlink or copy target for build)

### Steps

- [ ] **Step 1: Create static file embed and SPA handler**

```go
// server/internal/platform/static.go
package platform

import (
	"io/fs"
	"net/http"
	"strings"
)

func NewSPAHandler(staticFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(staticFS))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Try to serve the exact file
		if f, err := staticFS.Open(strings.TrimPrefix(path, "/")); err == nil {
			f.Close()
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try with .html extension (Next.js static export pattern)
		htmlPath := strings.TrimPrefix(path, "/") + ".html"
		if f, err := staticFS.Open(htmlPath); err == nil {
			f.Close()
			r.URL.Path = path + ".html"
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try path/index.html (directory routes)
		indexPath := strings.TrimPrefix(path, "/") + "/index.html"
		if f, err := staticFS.Open(indexPath); err == nil {
			f.Close()
			r.URL.Path = path + "/index.html"
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: serve index.html for client-side routing
		r.URL.Path = "/index.html"
		fileServer.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 2: Create embed directive in cmd/xreader**

```go
// server/cmd/xreader/embed.go
package main

import "embed"

//go:embed all:static
var staticFS embed.FS
```

The build process will copy `web/out/` → `server/cmd/xreader/static/` before `go build`.

- [ ] **Step 3: Wire SPA handler into router as the fallback route**

In `server/internal/platform/router.go`, add at the end of `NewRouter()`:

```go
// After all /api/* and other routes, serve static files
// Pass staticFS as an optional parameter in RouterDeps
if deps.StaticFS != nil {
    subFS, _ := fs.Sub(deps.StaticFS, "static")
    router.NoRoute(gin.WrapH(NewSPAHandler(subFS)))
}
```

Update `RouterDeps`:
```go
type RouterDeps struct {
    Pool          *pgxpool.Pool
    SessionSecret string
    StaticFS      fs.FS // nil in dev mode
}
```

- [ ] **Step 4: Update Makefile with build pipeline**

```makefile
build:
	cd web && pnpm build
	rm -rf server/cmd/xreader/static
	cp -r web/out server/cmd/xreader/static
	cd server && go build -o bin/xreader ./cmd/xreader
```

- [ ] **Step 5: Test the embedded binary locally**

```bash
make build
DATABASE_URL="postgres://xreader:xreader@localhost:5432/xreader?sslmode=disable" \
  SESSION_SECRET=test-secret \
  ./server/bin/xreader
```

Open `http://localhost:3000` — should serve the xReader frontend.
Open `http://localhost:3000/api/health` — should return `{"status":"ok"}`.
Navigate to `/settings`, `/sources`, `/highlights` — should work via SPA routing.

- [ ] **Step 6: Commit**

```
feat: embed static frontend in Go binary

Go binary now serves the Next.js static export via embed.FS.
SPA fallback handler serves index.html for all unmatched routes,
enabling client-side routing. Build pipeline: pnpm build → copy
out/ → go build with embedded static/.
```

---

## Task 8: Unified Dockerfile

Create a multi-stage Dockerfile that builds frontend + backend into a single image.

**Files:**
- Modify: `Dockerfile` (root level, new file)
- Modify: `docker-compose.yml` (simplify to 2 services)
- Delete: `server/Dockerfile` (if exists)
- Delete: `web/Dockerfile` (if exists)

### Steps

- [ ] **Step 1: Create root Dockerfile**

```dockerfile
# Dockerfile (root of repo)

# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# Stage 2: Build Go binary
FROM golang:1.25-alpine AS backend
WORKDIR /app/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=frontend /app/web/out ./cmd/xreader/static/
RUN CGO_ENABLED=0 GOFLAGS="-trimpath" go build -ldflags="-s -w" -o /xreader ./cmd/xreader

# Stage 3: Minimal runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /xreader /usr/local/bin/xreader
COPY server/db/migrations /migrations
EXPOSE 3000
ENTRYPOINT ["xreader"]
```

- [ ] **Step 2: Update docker-compose.yml to final 2-service form**

```yaml
services:
  xreader:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://xreader:xreader@postgres:5432/xreader?sslmode=disable
      SESSION_SECRET: ${SESSION_SECRET:-change-me-to-a-random-string}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: xreader
      POSTGRES_PASSWORD: xreader
      POSTGRES_DB: xreader
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U xreader"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  pgdata: {}
```

- [ ] **Step 3: Delete old Dockerfiles**

```bash
rm -f server/Dockerfile web/Dockerfile
```

- [ ] **Step 4: Build and test**

```bash
docker compose build
docker compose up -d
# Wait for startup, then test:
curl http://localhost:3000/api/health
# Open http://localhost:3000 in browser
docker compose down
```

- [ ] **Step 5: Commit**

```
feat: unified multi-stage Dockerfile for 2-container deployment

Single Dockerfile builds frontend (static export) and Go binary
in separate stages. Final image is ~30MB Alpine with the single
xreader binary. docker-compose.yml reduced to 2 services:
xreader + postgres.
```

---

## Task 9: Auto-Migrate on Startup

The binary should automatically run database migrations on startup so users don't need `make migrate-up`.

**Files:**
- Modify: `server/cmd/xreader/main.go`
- The migration files are already embedded via the Dockerfile `COPY server/db/migrations /migrations`

### Steps

- [ ] **Step 1: Add auto-migration to main.go**

Add before the worker and HTTP server startup:

```go
import "github.com/golang-migrate/migrate/v4"
import _ "github.com/golang-migrate/migrate/v4/database/postgres"
import _ "github.com/golang-migrate/migrate/v4/source/file"

func runMigrations(dbURL string) error {
	m, err := migrate.New("file:///migrations", dbURL)
	if err != nil {
		return fmt.Errorf("migration init: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("migration up: %w", err)
	}
	return nil
}
```

Call `runMigrations(dbURL)` early in `main()`, before creating the pool.

For local dev (non-Docker), also support `file://server/db/migrations` path via env var `MIGRATIONS_PATH`.

- [ ] **Step 2: Test with fresh database**

```bash
docker compose down -v  # destroy volumes
docker compose up -d
# Should auto-create all tables
curl http://localhost:3000/api/health
```

- [ ] **Step 3: Commit**

```
feat: auto-run database migrations on startup

Binary automatically applies pending migrations on startup using
golang-migrate. Eliminates the need for manual `make migrate-up`.
Migration files are embedded in the Docker image at /migrations.
```

---

## Task 10: Setup Wizard

Web-based first-run setup covering GitHub OAuth, AI config, and admin account — replaces `make seed-admin` and manual `.env` editing.

**Security:** The setup endpoints are protected by a `SETUP_TOKEN`. On first startup with no admin, the binary generates a random token and prints it to stdout: `Setup token: abc123... (use this at http://localhost:3000/setup)`. The user must enter this token to complete setup. This prevents "first visitor wins" attacks on publicly exposed instances.

**Config precedence:** Environment variables (e.g. `GITHUB_CLIENT_ID`) always override database settings. The wizard writes to the `settings` table; users who prefer env vars can skip the wizard's OAuth/AI steps if those env vars are already set.

**Files:**
- Create: `server/internal/setup/handler.go`
- Create: `server/internal/setup/handler_test.go`
- Create: `server/db/migrations/009_settings.up.sql` (general settings table)
- Create: `server/db/migrations/009_settings.down.sql`
- Create: `web/src/app/(setup)/setup/page.tsx`
- Modify: `server/internal/platform/router.go` (add setup routes)
- Modify: `server/cmd/xreader/main.go` (generate and print setup token)

### Steps

- [ ] **Step 1: Create settings migration**

```sql
-- server/db/migrations/009_settings.up.sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```sql
-- server/db/migrations/009_settings.down.sql
DROP TABLE IF EXISTS settings;
```

- [ ] **Step 2: Write failing tests**

```go
// server/internal/setup/handler_test.go
package setup_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/jin/xreader-web/internal/setup"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testSetupToken = "test-setup-token-abc123"

func TestSetupHandler_Status_NeedsSetup(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/setup/status", h.Status)

	req := httptest.NewRequest("GET", "/api/setup/status", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]bool
	json.Unmarshal(w.Body.Bytes(), &resp)
	assert.True(t, resp["needs_setup"])
}

func TestSetupHandler_Complete_WithToken(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/setup/complete", h.Complete)
	r.GET("/api/setup/status", h.Status)

	body := `{
		"setup_token": "test-setup-token-abc123",
		"github_client_id": "abc",
		"github_client_secret": "secret",
		"github_callback_url": "http://localhost:3000/api/auth/callback",
		"admin_github_username": "testuser"
	}`
	req := httptest.NewRequest("POST", "/api/setup/complete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	// Status should say setup is done
	req2 := httptest.NewRequest("GET", "/api/setup/status", nil)
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)
	var resp map[string]bool
	json.Unmarshal(w2.Body.Bytes(), &resp)
	assert.False(t, resp["needs_setup"])

	// Verify settings were saved
	var val string
	err := pool.QueryRow(context.Background(),
		`SELECT value FROM settings WHERE key = 'github_client_id'`).Scan(&val)
	require.NoError(t, err)
	assert.Equal(t, "abc", val)
}

func TestSetupHandler_Complete_MissingCallbackURL(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/setup/complete", h.Complete)

	body := `{
		"setup_token": "test-setup-token-abc123",
		"github_client_id": "abc",
		"github_client_secret": "secret",
		"admin_github_username": "testuser"
	}`
	req := httptest.NewRequest("POST", "/api/setup/complete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "github_callback_url")
}

func TestSetupHandler_Complete_PartialAIConfig(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/setup/complete", h.Complete)

	// Only ai_endpoint without model/key — should be rejected
	body := `{
		"setup_token": "test-setup-token-abc123",
		"github_client_id": "abc",
		"github_client_secret": "secret",
		"github_callback_url": "http://localhost:3000/api/auth/callback",
		"ai_endpoint": "https://api.example.com",
		"admin_github_username": "testuser"
	}`
	req := httptest.NewRequest("POST", "/api/setup/complete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Contains(t, w.Body.String(), "ai_endpoint, ai_model, and ai_api_key")
}

func TestSetupHandler_Complete_WrongToken(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/setup/complete", h.Complete)

	body := `{
		"setup_token": "wrong-token",
		"admin_github_username": "testuser"
	}`
	req := httptest.NewRequest("POST", "/api/setup/complete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestSetupHandler_Complete_AlreadyDone(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	// Seed an admin first
	pool.Exec(context.Background(),
		`INSERT INTO auth_allowlist (github_username) VALUES ('existing')`)

	h := setup.NewHandler(pool, testSetupToken)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/setup/complete", h.Complete)

	body := `{"setup_token": "test-setup-token-abc123", "admin_github_username": "testuser"}`
	req := httptest.NewRequest("POST", "/api/setup/complete", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
```

- [ ] **Step 3: Extract shared crypto helper from ai/settings.go**

Create `server/internal/crypto/secrets.go` by extracting the unexported functions from `ai/settings.go`:

```go
// server/internal/crypto/secrets.go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"io"
	"os"
	"strings"
)

const defaultPassphrase = "xreader-local-ai-settings-v1"

func passphrase() string {
	if v := os.Getenv("XREADER_AI_ENCRYPTION_KEY"); v != "" {
		return v
	}
	return defaultPassphrase
}

func newCipher() (cipher.AEAD, error) {
	key := sha256.Sum256([]byte(passphrase()))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func EncryptSecret(plaintext string) (ciphertext, nonce []byte, err error) {
	trimmed := strings.TrimSpace(plaintext)
	if trimmed == "" {
		return nil, nil, nil
	}
	gcm, err := newCipher()
	if err != nil {
		return nil, nil, err
	}
	n := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, n); err != nil {
		return nil, nil, err
	}
	return gcm.Seal(nil, n, []byte(trimmed), nil), n, nil
}

func DecryptSecret(ciphertext, nonce []byte) (string, error) {
	gcm, err := newCipher()
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
```

Then update `ai/settings.go` to import from this package:
```go
// Replace unexported encryptAPIKey/decryptAPIKey/apiKeyCipher calls with:
import "github.com/jin/xreader-web/internal/crypto"
// encryptAPIKey → crypto.EncryptSecret
// decryptAPIKey → crypto.DecryptSecret
```

Run: `cd server && go test ./internal/ai/... -v -count=1`
Expected: All AI tests still pass after the refactor.

- [ ] **Step 4: Run test to verify setup package fails**

Run: `cd server && go test ./internal/setup/... -v -count=1`
Expected: FAIL — package not found

- [ ] **Step 5: Implement setup handler**

```go
// server/internal/setup/handler.go
package setup

import (
	"context"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jin/xreader-web/internal/crypto"
)

type Handler struct {
	pool       *pgxpool.Pool
	setupToken string
}

func NewHandler(pool *pgxpool.Pool, setupToken string) *Handler {
	return &Handler{pool: pool, setupToken: setupToken}
}

func (h *Handler) Status(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"needs_setup": h.needsSetup(c.Request.Context())})
}

type completeRequest struct {
	SetupToken          string `json:"setup_token" binding:"required"`
	GitHubClientID      string `json:"github_client_id"`
	GitHubClientSecret  string `json:"github_client_secret"`
	GitHubCallbackURL   string `json:"github_callback_url"`
	AIEndpoint          string `json:"ai_endpoint"`
	AIModel             string `json:"ai_model"`
	AIAPIKey            string `json:"ai_api_key"`
	AdminGitHubUsername string `json:"admin_github_username" binding:"required"`
}

func (h *Handler) Complete(c *gin.Context) {
	ctx := c.Request.Context()

	if !h.needsSetup(ctx) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "setup already completed"})
		return
	}

	var req completeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if subtle.ConstantTimeCompare([]byte(req.SetupToken), []byte(h.setupToken)) != 1 {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid setup token"})
		return
	}

	// Validate: OAuth config must come from either env vars or this request.
	// Without it the instance can never log in and the wizard can't re-run.
	ghID := firstNonEmpty(os.Getenv("GITHUB_CLIENT_ID"), req.GitHubClientID)
	ghSecret := firstNonEmpty(os.Getenv("GITHUB_CLIENT_SECRET"), req.GitHubClientSecret)
	ghCallback := firstNonEmpty(os.Getenv("GITHUB_CALLBACK_URL"), req.GitHubCallbackURL)
	if ghID == "" || ghSecret == "" || ghCallback == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "github_client_id, github_client_secret, and github_callback_url " +
				"are required (either via this form or environment variables)",
		})
		return
	}
	if cbURL, err := url.Parse(ghCallback); err != nil || cbURL.Host == "" ||
		(cbURL.Scheme != "http" && cbURL.Scheme != "https") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "github_callback_url must be a valid http(s) URL"})
		return
	}

	// Validate AI config: optional, but if ANY field is provided, all three
	// (endpoint, model, api_key) must be present. Partial AI config would
	// leave the system in a broken state where the AI pipeline fails at runtime.
	hasAnyAI := req.AIEndpoint != "" || req.AIModel != "" || req.AIAPIKey != ""
	if hasAnyAI {
		if req.AIEndpoint == "" || req.AIModel == "" || req.AIAPIKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "AI configuration requires all three: ai_endpoint, ai_model, and ai_api_key. " +
					"Provide all or skip AI setup (configure later in Settings).",
			})
			return
		}
		normalized, err := normalizeAIEndpoint(req.AIEndpoint)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid AI endpoint: " + err.Error()})
			return
		}
		req.AIEndpoint = normalized
	}

	// ALL writes go through a single transaction. If any step fails,
	// tx.Rollback undoes everything — allowlist stays empty so the wizard
	// can be retried. We use raw tx.Exec instead of service wrappers
	// (ai.SettingsService, admin.AllowlistService) because those create
	// their own pool connections outside our transaction.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tx begin failed"})
		return
	}
	defer tx.Rollback(ctx)

	// 1. Save plaintext OAuth settings
	for key, val := range map[string]string{
		"github_client_id":    req.GitHubClientID,
		"github_callback_url": req.GitHubCallbackURL,
	} {
		if val == "" {
			continue
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO settings (key, value) VALUES ($1, $2)
			 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
			key, val); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save settings"})
			return
		}
	}

	// 2. Save GitHub Client Secret encrypted, hex-encoded into TEXT column
	if req.GitHubClientSecret != "" {
		ct, nonce, err := crypto.EncryptSecret(req.GitHubClientSecret)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "encryption failed"})
			return
		}
		// Hex-encode binary ciphertext/nonce before storing in TEXT column
		for k, v := range map[string]string{
			"github_client_secret_ct":    hex.EncodeToString(ct),
			"github_client_secret_nonce": hex.EncodeToString(nonce),
		} {
			if _, err := tx.Exec(ctx,
				`INSERT INTO settings (key, value) VALUES ($1, $2)
				 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
				k, v); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save secret"})
				return
			}
		}
	}

	// 3. Save AI settings directly via SQL (not ai.SettingsService, which
	//    uses its own pool connection outside our tx).
	if req.AIEndpoint != "" || req.AIModel != "" || req.AIAPIKey != "" {
		var aiCT, aiNonce []byte
		var aiKeyHint string
		if req.AIAPIKey != "" {
			aiCT, aiNonce, err = crypto.EncryptSecret(req.AIAPIKey)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "AI key encryption failed"})
				return
			}
			if len(req.AIAPIKey) > 8 {
				aiKeyHint = req.AIAPIKey[:3] + "..." + req.AIAPIKey[len(req.AIAPIKey)-4:]
			} else {
				aiKeyHint = "***"
			}
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO ai_provider_settings (id, endpoint, model, api_key_ciphertext, api_key_nonce, api_key_hint)
			 VALUES (1, $1, $2, $3, $4, $5)
			 ON CONFLICT (id) DO UPDATE SET
			   endpoint = COALESCE(NULLIF($1,''), ai_provider_settings.endpoint),
			   model = COALESCE(NULLIF($2,''), ai_provider_settings.model),
			   api_key_ciphertext = COALESCE($3, ai_provider_settings.api_key_ciphertext),
			   api_key_nonce = COALESCE($4, ai_provider_settings.api_key_nonce),
			   api_key_hint = COALESCE(NULLIF($5,''), ai_provider_settings.api_key_hint),
			   updated_at = NOW()`,
			req.AIEndpoint, req.AIModel, aiCT, aiNonce, aiKeyHint); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save AI settings"})
			return
		}
	}

	// 4. Seed admin — direct SQL, not admin.AllowlistService (same tx reason).
	//    This is last because allowlist becoming non-empty locks the wizard.
	if _, err := tx.Exec(ctx,
		`INSERT INTO auth_allowlist (github_username) VALUES ($1)
		 ON CONFLICT DO NOTHING`, req.AdminGitHubUsername); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create admin"})
		return
	}
	// Promote existing user to admin if they've already logged in before
	tx.Exec(ctx,
		`UPDATE users SET role = 'admin' WHERE github_username = $1`,
		req.AdminGitHubUsername)

	if err := tx.Commit(ctx); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "tx commit failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) needsSetup(ctx context.Context) bool {
	var count int
	h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM auth_allowlist`).Scan(&count)
	return count == 0
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// normalizeAIEndpoint mirrors ai.normalizeEndpoint — validates URL
// and appends /v1 suffix if missing. Duplicated here to avoid
// importing the ai package into setup (which would create a circular
// dependency risk). The logic is small and stable.
func normalizeAIEndpoint(raw string) (string, error) {
	trimmed := strings.TrimRight(strings.TrimSpace(raw), "/")
	if trimmed == "" {
		return "", errors.New("endpoint is required")
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("endpoint must be a valid http(s) URL")
	}
	if !strings.HasSuffix(trimmed, "/v1") {
		trimmed += "/v1"
	}
	return trimmed, nil
}
```

- [ ] **Step 5: Run tests**

Run: `cd server && go test ./internal/setup/... -v -count=1`
Expected: All 4 tests PASS

- [ ] **Step 6: Generate and print setup token on startup**

In `server/cmd/xreader/main.go`, add to `main()` before starting the server:

```go
// Generate setup token if no admin exists
var adminCount int
pool.QueryRow(ctx, "SELECT COUNT(*) FROM auth_allowlist").Scan(&adminCount)
setupToken := ""
if adminCount == 0 {
    // Check env var first (useful for container orchestration / headless deploys)
    setupToken = os.Getenv("SETUP_TOKEN")
    if setupToken == "" {
        b := make([]byte, 24)
        rand.Read(b)
        setupToken = hex.EncodeToString(b)
    }
    log.Printf("\n==================================================")
    log.Printf("  SETUP TOKEN: %s", setupToken)
    log.Printf("  Open http://localhost:%s/setup to complete setup", port)
    log.Printf("==================================================\n")
}
```

Pass `setupToken` to the setup handler via `RouterDeps.SetupToken`.

- [ ] **Step 7: Wire setup routes into router**

In `server/internal/platform/router.go`, add `SetupToken` to `RouterDeps`:

```go
type RouterDeps struct {
    Pool          *pgxpool.Pool
    SessionSecret string
    SetupToken    string
    StaticFS      fs.FS
}
```

Add routes:
```go
setupH := setup.NewHandler(deps.Pool, deps.SetupToken)
router.GET("/api/setup/status", setupH.Status)
router.POST("/api/setup/complete", setupH.Complete)
```

- [ ] **Step 8: Create frontend Setup Wizard page**

Create `web/src/app/(setup)/setup/page.tsx` — a 3-step form:

1. **Setup Token**: text input, validate before proceeding
2. **GitHub OAuth**: Client ID + Client Secret + Callback URL (auto-filled)
3. **AI Service** (optional, skippable): Endpoint + Model + API Key
4. **Admin Account**: GitHub username

On submit, calls `POST /api/setup/complete` with all fields. On success, redirects to `/login`.

- [ ] **Step 9: Commit**

```
feat: add Setup Wizard with setup-token security

Web-based first-run setup covering GitHub OAuth config, AI service
config (optional), and admin account creation. Protected by a
one-time setup token printed to stdout on first startup. Secrets
encrypted at rest via AES-256-GCM.
```

---

## Task 10b: Config Resolver — env-first, DB-fallback

The Setup Wizard writes OAuth/AI config to the database, but the router currently reads `os.Getenv("GITHUB_CLIENT_ID")` directly. Add a resolver that checks env vars first, falls back to the `settings` table.

**Files:**
- Create: `server/internal/platform/config.go`
- Create: `server/internal/platform/config_test.go`
- Modify: `server/internal/platform/router.go` (use resolver instead of raw os.Getenv)
- Modify: `server/internal/auth/service.go` (accept config interface instead of hardcoded env)

### Steps

- [ ] **Step 1: Write failing test**

```go
// server/internal/platform/config_test.go
package platform_test

import (
	"context"
	"testing"

	"github.com/jin/xreader-web/internal/platform"
	"github.com/jin/xreader-web/internal/testutil"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigResolver_EnvOverridesDB(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	// Insert DB value
	pool.Exec(context.Background(),
		`INSERT INTO settings (key, value) VALUES ('github_client_id', 'from-db')`)

	// Env var takes precedence
	t.Setenv("GITHUB_CLIENT_ID", "from-env")
	r := platform.NewConfigResolver(pool)
	val := r.Get(context.Background(), "GITHUB_CLIENT_ID", "github_client_id")
	assert.Equal(t, "from-env", val)
}

func TestConfigResolver_FallbackToDB(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	pool.Exec(context.Background(),
		`INSERT INTO settings (key, value) VALUES ('github_client_id', 'from-db')`)

	r := platform.NewConfigResolver(pool)
	val := r.Get(context.Background(), "GITHUB_CLIENT_ID_UNSET", "github_client_id")
	assert.Equal(t, "from-db", val)
}

func TestConfigResolver_BothEmpty(t *testing.T) {
	pool, cleanup := testutil.SetupTestDB(t, context.Background())
	defer cleanup()

	r := platform.NewConfigResolver(pool)
	val := r.Get(context.Background(), "NONEXISTENT_ENV", "nonexistent_key")
	assert.Empty(t, val)
}
```

- [ ] **Step 2: Implement ConfigResolver**

```go
// server/internal/platform/config.go
package platform

import (
	"context"
	"encoding/hex"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jin/xreader-web/internal/crypto"
)

type ConfigResolver struct {
	pool *pgxpool.Pool
}

func NewConfigResolver(pool *pgxpool.Pool) *ConfigResolver {
	return &ConfigResolver{pool: pool}
}

// Get checks the environment variable first (envKey), then falls back
// to the settings table (dbKey). Returns empty string if neither is set.
func (r *ConfigResolver) Get(ctx context.Context, envKey, dbKey string) string {
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	var val string
	err := r.pool.QueryRow(ctx,
		`SELECT value FROM settings WHERE key = $1`, dbKey).Scan(&val)
	if err != nil {
		return ""
	}
	return val
}

// GetEncryptedSecret checks the env var first; if unset, reads ciphertext
// and nonce from the settings table (stored as two rows: dbKeyPrefix+"_ct"
// and dbKeyPrefix+"_nonce") and decrypts using the shared crypto helper.
// This matches how setup.Handler stores encrypted secrets.
func (r *ConfigResolver) GetEncryptedSecret(ctx context.Context, envKey, dbKeyPrefix string) string {
	if v := os.Getenv(envKey); v != "" {
		return v
	}
	var ctHex, nonceHex string
	r.pool.QueryRow(ctx,
		`SELECT value FROM settings WHERE key = $1`, dbKeyPrefix+"_ct").Scan(&ctHex)
	r.pool.QueryRow(ctx,
		`SELECT value FROM settings WHERE key = $1`, dbKeyPrefix+"_nonce").Scan(&nonceHex)
	if ctHex == "" || nonceHex == "" {
		return ""
	}
	ct, err := hex.DecodeString(ctHex)
	if err != nil {
		return ""
	}
	nonce, err := hex.DecodeString(nonceHex)
	if err != nil {
		return ""
	}
	// Uses the shared crypto package (internal/crypto, extracted from ai/settings.go)
	plaintext, err := crypto.DecryptSecret(ct, nonce)
	if err != nil {
		return ""
	}
	return plaintext
}
```

- [ ] **Step 3: Run tests**

Run: `cd server && go test ./internal/platform/... -run TestConfigResolver -v -count=1`
Expected: All 3 tests PASS

- [ ] **Step 4: Wire ConfigResolver into router**

In `server/internal/platform/router.go`, replace direct `os.Getenv` calls:

```go
// In router.go NewRouter(), replace lines 31-34:
//   ghClient := auth.NewGitHubClient(
//     os.Getenv("GITHUB_CLIENT_ID"),
//     os.Getenv("GITHUB_CLIENT_SECRET"),
//     os.Getenv("GITHUB_CALLBACK_URL"),
//   )
// With:
cfg := NewConfigResolver(deps.Pool)
ctx := context.Background()
ghClient := auth.NewGitHubClient(
    cfg.Get(ctx, "GITHUB_CLIENT_ID", "github_client_id"),
    cfg.GetEncryptedSecret(ctx, "GITHUB_CLIENT_SECRET", "github_client_secret"),
    cfg.Get(ctx, "GITHUB_CALLBACK_URL", "github_callback_url"),
)
```

- [ ] **Step 5: Add regression test — wizard-configured OAuth works at runtime**

Test that after writing settings via the setup handler, the router reads them correctly when env vars are unset.

- [ ] **Step 6: Commit**

```
feat: add ConfigResolver with env-first, DB-fallback

GitHub OAuth and AI settings can now be configured via either
environment variables (highest priority) or the Setup Wizard
(writes to the settings table). Secrets decrypted at read time
using AES-256-GCM. Ensures wizard-configured instances work
without any env vars beyond SESSION_SECRET.
```

## Task 11: End-to-End Verification

Verify the complete 2-container stack works from scratch.

### Steps

- [ ] **Step 1: Clean slate test**

```bash
docker compose down -v
docker compose build
docker compose up -d
```

- [ ] **Step 2: Verify Setup Wizard**

Open `http://localhost:3000/setup` — should show the wizard.
Enter admin GitHub username → Complete → Redirect to login.

- [ ] **Step 3: Verify login and core features**

- GitHub OAuth login works
- Feed loads, articles display
- Reader with bilingual translation works
- Highlights work
- Settings page works
- Sources page works

- [ ] **Step 4: Verify worker is running**

Check logs: `docker compose logs xreader | grep "worker:"`
Expected: Worker fetch loop messages every 60 seconds.

- [ ] **Step 5: Commit any fixes found during verification**
