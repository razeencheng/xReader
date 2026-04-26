# xReader Web v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. For each task, also invoke `superpowers:test-driven-development` to expand the listed "Key tests" into full red-green-refactor cycles. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship xReader Web v1 — a private, design-first information aggregation platform that gives its small group of invited users a flat scannable feed with AI-summarized key points (要点), native-language title translation, and a reader with alternating-paragraph bilingual body. RSS sources only; OpenAI-compatible AI.

**Architecture:** Go (Gin) monolithic API + Go worker for RSS fetch and AI jobs; PostgreSQL for primary storage; Redis for sessions, job queue, and pub/sub. Next.js 15 (App Router) frontend with Zustand + React Query. Hybrid AI pipeline: eager title+要点 on fetch, lazy body-translation via SSE on detail open. Docker Compose on homelab. See `docs/superpowers/specs/2026-04-18-xreader-web-v1-design.md` (referred below as "the spec") and `docs/superpowers/specs/mockups/*.html` for authoritative detail — every ambiguity in this plan is resolved in their favor.

**Tech Stack:**
- Backend: Go 1.22+, Gin, sqlc + pgx/v5, golang-migrate, gofeed, bluemonday, slog
- Frontend: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Zustand, TanStack React Query
- Data: PostgreSQL 16, Redis 7
- Testing: Go stdlib + testcontainers-go (backend), Vitest + Testing Library + MSW + Playwright (frontend)
- Contract: OpenAPI 3.1
- AI: OpenAI-compatible HTTP client, config-driven

---

## Prerequisites (do once before Sprint 0)

- [ ] Install Go ≥ 1.22, Node ≥ 20, pnpm ≥ 9, Docker Desktop, `golang-migrate`, `sqlc`
- [ ] Create a GitHub OAuth App: https://github.com/settings/developers — set callback to `http://localhost:3000/api/auth/callback/github` for dev; capture the client ID + secret into `.env`
- [ ] Create an AI relay account (OpenRouter / one-api / the owner's private relay); have a base URL, API key, and chosen model name ready

---

## Sprint Overview

| # | Sprint | Primary deliverable | Depends on |
|---|---|---|---|
| 0 | Scaffold | Monorepo + Docker Compose + CI; `/health` returns 200 | — |
| 1 | Auth | GitHub OAuth + session + allowlist; login flow works end-to-end | 0 |
| 2 | Sources + RSS fetch | CRUD for sources; cron worker fetches articles into DB | 1 |
| 3 | Articles + OPML | List/detail/state endpoints; OPML import/export; full-text search | 2 |
| 4 | AI pipeline | Eager title + 要点 on fetch; lazy body translation streaming over SSE | 3 |
| 5 | Frontend feed | Next.js shell + feed page (tabs + density toggle + both row modes) matching mockups 01 & 02 | 4 |
| 6 | Reader + highlights | Reader page (alternating body + 要点 callout + prev/next + next-up card); highlights + notes | 5 |
| 7 | Settings + admin + sync | Settings, sources management, admin allowlist UI, multi-tab sync | 6 |
| 8 | Polish + deploy | Dark mode, mobile responsive, keyboard system, E2E, production deploy | 7 |

Each sprint is independently committable; the owner can stop after any sprint and still have a working (though incomplete) product.

---

## Sprint 0 — Monorepo scaffold

Produces: a `git` repo that builds, runs via `docker compose up`, has `/health` returning 200, and CI green.

### Task 0.1 — Initialize Go module + Gin server with `/health`

**Files:**
- Create: `server/go.mod`, `server/cmd/api/main.go`, `server/internal/platform/router.go`, `server/internal/platform/health.go`, `server/internal/platform/health_test.go`
- Modify: (none)
- Test: `server/internal/platform/health_test.go`

**Key tests:**

```go
// server/internal/platform/health_test.go
package platform

import (
    "net/http"
    "net/http/httptest"
    "testing"

    "github.com/gin-gonic/gin"
    "github.com/stretchr/testify/assert"
)

func TestHealth_ReturnsOK(t *testing.T) {
    gin.SetMode(gin.TestMode)
    r := NewRouter()
    w := httptest.NewRecorder()
    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    r.ServeHTTP(w, req)
    assert.Equal(t, http.StatusOK, w.Code)
    assert.JSONEq(t, `{"status":"ok"}`, w.Body.String())
}
```

**Steps:**
- [ ] Step 1: `cd server && go mod init github.com/jin/xreader-web && go get github.com/gin-gonic/gin github.com/stretchr/testify`
- [ ] Step 2: Write `health_test.go` (above). Run `go test ./internal/platform/...` — expect FAIL (`NewRouter` undefined).
- [ ] Step 3: Implement `router.go` with `NewRouter()` returning a Gin engine; register `GET /health → {"status":"ok"}` inside `health.go`.
- [ ] Step 4: Implement `cmd/api/main.go` to call `NewRouter()` and run on `:8080`.
- [ ] Step 5: `go test ./...` — expect PASS. Run `go run ./cmd/api` and `curl :8080/health` — expect `{"status":"ok"}`.
- [ ] Step 6: Commit `git add server && git commit -m "chore(server): scaffold Go API with /health"`

### Task 0.2 — Initialize Next.js 15 app with placeholder home

**Files:**
- Create: `web/package.json`, `web/next.config.ts`, `web/tsconfig.json`, `web/app/layout.tsx`, `web/app/page.tsx`, `web/src/test-setup.ts`, `web/vitest.config.ts`, `web/app/page.test.tsx`
- Test: `web/app/page.test.tsx`

**Key tests:**

```tsx
// web/app/page.test.tsx
import { render, screen } from '@testing-library/react';
import Page from './page';

test('home page renders app title', () => {
  render(<Page />);
  expect(screen.getByText(/xReader/i)).toBeInTheDocument();
});
```

**Steps:**
- [ ] Step 1: `cd web && pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias="@/*"` (accept defaults). Remove the default home content.
- [ ] Step 2: Add dev deps: `pnpm add -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom msw playwright`
- [ ] Step 3: Create `vitest.config.ts` with `jsdom` environment and `src/test-setup.ts` importing `@testing-library/jest-dom`.
- [ ] Step 4: Replace `app/page.tsx` with `export default function Home() { return <main>xReader</main>; }`.
- [ ] Step 5: Write `app/page.test.tsx` (above). Run `pnpm vitest run` — expect PASS.
- [ ] Step 6: `pnpm build` — expect success.
- [ ] Step 7: Commit `git add web && git commit -m "chore(web): scaffold Next.js 15 app with Vitest"`

### Task 0.3 — Docker Compose (Postgres, Redis, api, worker, web) + Makefile + `.env.example`

**Files:**
- Create: `docker-compose.yml`, `Makefile`, `.env.example`, `server/Dockerfile`, `web/Dockerfile`

**Implementation notes:**

`docker-compose.yml` must expose: postgres at `5432`, redis at `6379`, api at `8080`, web at `3000`. Use named volumes `pgdata`, `redisdata`. Full schema is §11 of the spec.

`.env.example` must list every variable from spec Appendix B. Never commit actual secrets; `.env.example` is safe to commit.

`Makefile` targets (exact names):

```make
.PHONY: up down build test test-server test-web migrate-up migrate-down sqlc-generate lint seed-admin

up:           ; docker compose up -d
down:         ; docker compose down
build:        ; cd server && go build ./... && cd ../web && pnpm build
test:         ; $(MAKE) test-server && $(MAKE) test-web
test-server:  ; cd server && go test ./...
test-web:     ; cd web && pnpm vitest run
migrate-up:   ; cd server && migrate -path db/migrations -database "$$DATABASE_URL" up
migrate-down: ; cd server && migrate -path db/migrations -database "$$DATABASE_URL" down 1
sqlc-generate:; cd server && sqlc generate
lint:         ; cd server && go vet ./... && cd ../web && pnpm lint
seed-admin:   ; cd server && go run ./cmd/api seed-admin --github-username=$${GH_USER}
```

**Steps:**
- [ ] Step 1: Write `docker-compose.yml` per spec §11.1; add minimal Dockerfiles that copy the compiled binaries for api/worker and `pnpm build` output for web.
- [ ] Step 2: Write `.env.example` from spec Appendix B.
- [ ] Step 3: Write `Makefile` (above).
- [ ] Step 4: `cp .env.example .env` (local only; already gitignored), `make up` — expect all 5 containers to come up healthy. `curl :8080/health` → `{"status":"ok"}`.
- [ ] Step 5: Commit `git commit -m "chore: add docker-compose, Makefile, env template"`

### Task 0.4 — CI (GitHub Actions): vet + test backend, lint + test + build frontend

**Files:**
- Create: `.github/workflows/ci.yml`

**Implementation notes:**

The workflow needs three jobs: `backend`, `frontend`, `openapi` (stubbed for now; expands in later sprints). Backend job spins up a Postgres service container for testcontainers-go to `DATABASE_URL` against, and a Redis service. Run `go vet`, then `go test -race ./...`. Frontend runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm vitest run`, `pnpm build`.

**Steps:**
- [ ] Step 1: Write `ci.yml` with the 3 jobs.
- [ ] Step 2: Push the branch; verify CI is green.
- [ ] Step 3: Commit (already included in push).

---

## Sprint 1 — Auth (GitHub OAuth + session + allowlist)

Produces: A user whose GitHub login is on the allowlist can sign in; `GET /api/auth/me` returns their profile; `seed-admin` CLI seeds the first admin.

### Task 1.1 — DB migration 001: users, auth_sessions, auth_allowlist

**Files:**
- Create: `server/db/migrations/001_auth.up.sql`, `server/db/migrations/001_auth.down.sql`, `server/db/queries/users.sql`, `server/db/queries/allowlist.sql`, `server/db/sqlc.yaml`, `server/internal/testutil/testdb.go`, `server/internal/testutil/testdb_test.go`

**Implementation notes:**

Schema for `users`, `auth_sessions`, `auth_allowlist` is exact from spec §7.1. Use pgx/v5 driver in `sqlc.yaml`; emit JSON tags. `testdb.go` spins up a real Postgres via `testcontainers-go/modules/postgres`, auto-applies migrations, returns a `*pgxpool.Pool`. Every backend test from here on uses this helper.

**Key tests:**

```go
// server/internal/testutil/testdb_test.go
func TestSetupTestDB_Bootstraps(t *testing.T) {
    ctx := context.Background()
    pool, cleanup := SetupTestDB(t, ctx)
    t.Cleanup(cleanup)
    var count int
    err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
    require.NoError(t, err)
    require.Equal(t, 0, count) // table exists, starts empty
}
```

**Steps:**
- [ ] Step 1: Write `001_auth.up.sql` (three tables per spec §7.1) and `001_auth.down.sql` (DROP TABLEs in reverse).
- [ ] Step 2: Write `sqlc.yaml` (pgx/v5, queries dir, gen dir). Write initial `users.sql` and `allowlist.sql` with CRUD queries.
- [ ] Step 3: `make sqlc-generate` — expect `db/gen/` produced.
- [ ] Step 4: Write `testdb.go` using `testcontainers-go`. Test it (above) — expect PASS.
- [ ] Step 5: Commit `git commit -m "feat(db): migration 001 auth tables + sqlc + testcontainers helper"`

### Task 1.2 — GitHub OAuth handler (login begin, callback, CSRF state)

**Files:**
- Create: `server/internal/auth/github.go`, `server/internal/auth/github_mock.go`, `server/internal/auth/service.go`, `server/internal/auth/handler.go`, `server/internal/auth/handler_test.go`, `server/internal/auth/service_test.go`
- Modify: `server/internal/platform/router.go` (mount auth routes)

**Implementation notes:**

- `GitHubClient` interface: `ExchangeCode(ctx, code string) (token string, err)`, `FetchUser(ctx, token) (github_id, username, avatar_url, err)`.
- `MockGitHubClient` implements it with fixed responses for tests.
- State param for CSRF stored in Redis with 10-min TTL, keyed by state → redirect URL.
- On callback: verify state → exchange code → fetch user → check allowlist → create/update user row → create session (Redis + DB) → set cookie → redirect.

**Key tests:**

```go
func TestAuthService_Callback_DeniesUnallowlistedUser(t *testing.T) {
    svc := newTestService(t,
        withGitHubUser(github_id: 123, username: "stranger"),
        withAllowlist([]string{"alice", "bob"}),
    )
    _, err := svc.Callback(ctx, "valid-state", "gh-code")
    require.ErrorIs(t, err, ErrNotAllowlisted)
}

func TestAuthService_Callback_HappyPath_CreatesUserAndSession(t *testing.T) { ... }
func TestAuthService_Callback_RejectsInvalidState(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Sketch interfaces in `github.go` (real impl via `golang.org/x/oauth2/github`) and `service.go`.
- [ ] Step 2: Write `handler_test.go` for `GET /api/auth/github` (expect 302 to github.com with state) and `GET /api/auth/callback/github` (happy + denied + bad-state). Run — expect FAIL.
- [ ] Step 3: Implement. Wire into router under `/api/auth/*`.
- [ ] Step 4: Tests pass. Manually verify locally: set real `GITHUB_CLIENT_ID/SECRET` in `.env`, `make up`, click "sign in" → GitHub → return. (Requires Task 1.3 session cookie setter; initial smoke test can stop at "access_token obtained, user in DB".)
- [ ] Step 5: Commit `git commit -m "feat(auth): GitHub OAuth with CSRF state"`

### Task 1.3 — Session store (Redis) + auth middleware + `GET /api/auth/me` + logout

**Files:**
- Create: `server/internal/auth/session.go`, `server/internal/auth/session_test.go`, `server/internal/middleware/auth.go`, `server/internal/middleware/auth_test.go`, `server/internal/auth/me_handler.go`
- Modify: `server/internal/platform/router.go` (wire middleware + `/api/auth/me`, `/api/auth/logout`)

**Implementation notes:**

- `SessionStore` interface with `Create(user_id) (session_id, error)`, `Get(session_id) (user_id, error)`, `Delete(session_id)`, `Touch(session_id)`.
- Redis impl: key `session:<id>`, value `<user_id>`, TTL 30 days sliding (refresh on `Touch` which middleware calls on every request).
- Also write to `auth_sessions` table for audit (user_agent, created_at, last_seen_at).
- Middleware sets `c.Set("user", user)` for downstream handlers; returns 401 if no session or expired.
- `RequireAdmin` middleware checks `user.role == "admin"`.

**Key tests:**

```go
func TestAuthMiddleware_NoCookie_Returns401(t *testing.T) { ... }
func TestAuthMiddleware_ValidSession_AllowsRequest(t *testing.T) { ... }
func TestAuthMiddleware_ExpiredSession_Returns401(t *testing.T) { ... }
func TestGetMe_ReturnsCurrentUserProfile(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Write tests. Run — FAIL.
- [ ] Step 2: Implement Redis `SessionStore`, mock version in `session.go`, middleware, `/me` and `/logout` handlers.
- [ ] Step 3: Integration test: login flow from 1.2 now sets `xreader_session` cookie; subsequent `/api/auth/me` returns user JSON.
- [ ] Step 4: Commit `git commit -m "feat(auth): Redis session store + auth middleware + /me + /logout"`

### Task 1.4 — `seed-admin` CLI + admin allowlist endpoints

**Files:**
- Create: `server/cmd/api/seed_admin.go`, `server/internal/admin/allowlist_service.go`, `server/internal/admin/allowlist_handler.go`, `server/internal/admin/allowlist_test.go`

**Implementation notes:**

- `seed-admin` is a Cobra-style subcommand on the api binary. Usage: `api seed-admin --github-username=razeencheng`. It inserts the username into `auth_allowlist`, and if a user row exists with that username, upgrades `role` to `admin`.
- Admin-only endpoints (guarded by `RequireAdmin`): `GET /api/admin/allowlist`, `POST /api/admin/allowlist` (body: `{github_username, note?}`), `DELETE /api/admin/allowlist/:github_username`.

**Key tests:**

```go
func TestAllowlist_AddRemoveList(t *testing.T) {
    svc := newTestAllowlistService(t)
    require.NoError(t, svc.Add(ctx, "alice", "initial admin"))
    entries, _ := svc.List(ctx)
    require.Len(t, entries, 1)
    require.Equal(t, "alice", entries[0].GithubUsername)
    require.NoError(t, svc.Remove(ctx, "alice"))
}

func TestSeedAdmin_PromotesExistingUser(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Write tests. FAIL.
- [ ] Step 2: Implement service + handler + CLI subcommand.
- [ ] Step 3: Manually: `docker compose run api seed-admin --github-username=razeencheng`; log in with that GitHub account; verify `/api/auth/me` returns `role: "admin"`.
- [ ] Step 4: Commit `git commit -m "feat(admin): allowlist CRUD + seed-admin CLI"`

---

## Sprint 2 — Sources + RSS fetch

Produces: A logged-in user can add an RSS URL, see it listed, and a background worker fetches articles every 15 min into the DB with dedup.

### Task 2.1 — DB migration 002: sources, articles

**Files:**
- Create: `server/db/migrations/002_sources_articles.up.sql`, `.down.sql`, `server/db/queries/sources.sql`, `server/db/queries/articles.sql`

**Implementation notes:**

Schema exactly per spec §7.1: `sources` (user-owned, soft-deleted via `deleted_at`, unique `(user_id, normalized_url)`) and `articles` (unique `(source_id, normalized_link)`). Include the GIN FTS index for `title || content_text` now to avoid a future migration.

**Key tests:**

```go
func TestSourceUnique_PerUserAndNormalizedURL(t *testing.T) {
    // Insert one; inserting a second with same (user_id, normalized_url) must error.
}
func TestArticleUnique_PerSourceAndNormalizedLink(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Write migrations + sqlc queries (Create, GetByID, ListByUser with `deleted_at IS NULL`, Update, SoftDelete, CountByUser).
- [ ] Step 2: `make sqlc-generate`.
- [ ] Step 3: Write constraint tests. Run — PASS after migrations apply.
- [ ] Step 4: Commit `git commit -m "feat(db): migration 002 sources + articles"`

### Task 2.2 — URL normalization (pure function, testable in isolation)

**Files:**
- Create: `server/internal/source/normalize.go`, `server/internal/source/normalize_test.go`

**Implementation notes:**

Per spec §6.4: strip `utm_*` / `ref=` / `fbclid=` query params, lowercase scheme + host, drop fragment, drop trailing slash, collapse `//` paths. Return error on invalid URL. Table-driven test covering at least 10 cases.

**Key tests:**

```go
func TestNormalize(t *testing.T) {
    cases := []struct{ in, want string }{
        {"HTTPS://Example.COM/Path/?utm_source=x", "https://example.com/Path"},
        {"https://example.com/a?ref=foo&x=1", "https://example.com/a?x=1"},
        {"https://example.com//a//b/", "https://example.com/a/b"},
        {"https://example.com/path#frag", "https://example.com/path"},
        // ... 6 more
    }
    for _, c := range cases {
        got, err := Normalize(c.in); require.NoError(t, err)
        require.Equal(t, c.want, got, "input=%s", c.in)
    }
}
```

**Steps:**
- [ ] Step 1: Write `normalize_test.go` (table-driven, 10 cases). Run — FAIL.
- [ ] Step 2: Implement `Normalize(string) (string, error)`. Run — PASS.
- [ ] Step 3: Commit `git commit -m "feat(source): URL normalization"`

### Task 2.3 — `SourceAdapter` interface + `RSSAdapter` implementation

**Files:**
- Create: `server/internal/source/adapter.go`, `server/internal/source/rss_adapter.go`, `server/internal/source/rss_adapter_test.go`, `server/internal/source/sanitize.go`

**Implementation notes:**

- `SourceAdapter` interface exactly per spec §6.2 (`Kind()`, `Fetch(ctx, Source) ([]RawItem, error)`, `Validate(ctx, url) (SourceMetadata, error)`).
- `RSSAdapter` uses `github.com/mmcdole/gofeed`. On fetch, returns `[]RawItem{ExternalID, Link, Title, ContentHTML (sanitized), PublishedAt, LanguageHint}`.
- `sanitize.go` wraps `bluemonday.UGCPolicy()` with extra removals: `<script>`, event handlers, data-URI images.
- `Validate` does a single fetch-and-parse, returns title + icon URL + language hint from the feed.
- Test with a local `httptest.Server` returning fixtures from `testdata/*.xml`. Include one Atom, one RSS 2.0, one malformed.

**Key tests:**

```go
func TestRSSAdapter_FetchesAndParsesAtomFeed(t *testing.T) {
    ts := httptest.NewServer(serveFixture(t, "testdata/atom_feed.xml"))
    defer ts.Close()
    a := NewRSSAdapter()
    items, err := a.Fetch(ctx, Source{URL: ts.URL})
    require.NoError(t, err)
    require.Len(t, items, 3)
    require.Equal(t, "Welcome", items[0].Title)
}

func TestRSSAdapter_Sanitizes_StripsScripts(t *testing.T) {
    // Feed contains <script>alert(1)</script> inside item body; expect sanitized output has no <script>.
}

func TestRSSAdapter_Validate_ReturnsMetadata(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Install `go get github.com/mmcdole/gofeed github.com/microcosm-cc/bluemonday`
- [ ] Step 2: Create fixture files.
- [ ] Step 3: Write tests. FAIL.
- [ ] Step 4: Implement interface + RSS adapter + sanitizer.
- [ ] Step 5: Tests PASS.
- [ ] Step 6: Commit `git commit -m "feat(source): SourceAdapter interface + RSS impl + HTML sanitizer"`

### Task 2.4 — Source CRUD API (list, add, rename, soft-delete, manual refresh, validate-URL)

**Files:**
- Create: `server/internal/source/service.go`, `server/internal/source/handler.go`, `server/internal/source/service_test.go`, `server/internal/source/handler_test.go`
- Modify: `server/internal/platform/router.go` (mount `/api/sources`)

**Endpoints (exact from spec §8.3):**
- `GET /api/sources` — list current user's non-deleted sources
- `POST /api/sources` — body `{url}`; server calls `Validate`, stores; returns source row
- `PATCH /api/sources/:id` — rename
- `DELETE /api/sources/:id` — soft delete
- `POST /api/sources/:id/refresh` — enqueue immediate fetch

**Key tests:**

```go
func TestSourceService_Create_DuplicateURL_Returns409(t *testing.T) { ... }
func TestSourceService_Create_InvalidURL_Returns400(t *testing.T) { ... }
func TestSourceService_Delete_OwnerOnly(t *testing.T) {
    // User A creates, User B attempts to delete → 404 (not 403; don't leak existence)
}
func TestSourceHandler_POST_AuthRequired(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Write tests (happy + ownership + dedup). FAIL.
- [ ] Step 2: Implement service + handler. Service calls the injected `SourceAdapter` (registry by `kind`).
- [ ] Step 3: Tests PASS. Manually: log in, `POST /api/sources` with a real feed URL, `GET /api/sources` shows it.
- [ ] Step 4: Commit `git commit -m "feat(source): CRUD API with validation + ownership checks"`

### Task 2.5 — Fetch worker (cron, per-source backoff, dedup)

**Files:**
- Create: `server/cmd/worker/main.go`, `server/internal/sync/worker.go`, `server/internal/sync/worker_test.go`, `server/internal/sync/fetchjob.go`

**Implementation notes:**

- Worker runs independently (second container). Goroutine loop: every 60s, scan `sources` for rows where `next_fetch_at <= now()` (compute `next_fetch_at` from `last_success_at + interval`); for each, enqueue a fetch job to the `sync_pool` (bounded concurrency, default 8).
- Per-source backoff: base 15 min; on `consecutive_fails >= 3`, switch to 1h; `>= 6`, switch to 6h. On success, reset `consecutive_fails = 0`.
- Dedup: insert articles with `ON CONFLICT (source_id, normalized_link) DO NOTHING`.
- After fetch, publish to Redis channel `article:new` with the new article IDs (Sprint 4 AI pipeline consumes).

**Key tests:**

```go
func TestFetchJob_DedupesByNormalizedLink(t *testing.T) {
    // Adapter returns 3 items; 1 already in DB with matching normalized_link.
    // After run: articles table has 3 total (2 new inserted); source.last_success_at updated.
}

func TestFetchJob_MarksFailureIncrementsCounter(t *testing.T) { ... }
func TestFetchJob_SuccessResetsFailCounter(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Build `cmd/worker/main.go` — reads env, connects DB + Redis, runs `worker.Run(ctx)`.
- [ ] Step 2: Implement job + tests.
- [ ] Step 3: `docker compose up -d worker` — logs show scheduled fetches. `SELECT count(*) FROM articles` increases over time.
- [ ] Step 4: Commit `git commit -m "feat(sync): RSS fetch worker with cron and backoff"`

---

## Sprint 3 — Articles + OPML + search

Produces: API to list/read articles with tabs, mutate read/starred/progress, import/export OPML, full-text search.

### Task 3.1 — DB migration 003: article_states + article_state_changes; articles FTS trigger

**Files:**
- Create: `server/db/migrations/003_states.up.sql`, `.down.sql`, `server/db/queries/articles.sql` (append), `server/db/queries/states.sql`

**Implementation notes:**

- `article_states` composite PK `(user_id, article_id)`; columns per spec §7.1.
- `article_state_changes` append-only for cross-device polling.
- Trigger on `articles` to maintain a materialized `tsvector` column `search_vec = to_tsvector('simple', title || ' ' || content_text)` indexed with GIN.

**Steps:**
- [ ] Step 1: Write migration + queries.
- [ ] Step 2: sqlc-generate.
- [ ] Step 3: Simple test: insert article → tsvector populated → `SELECT ... WHERE search_vec @@ plainto_tsquery(...)` returns the row.
- [ ] Step 4: Commit `git commit -m "feat(db): migration 003 article states + FTS"`

### Task 3.2 — Articles API: list with tabs (today / stream / starred), cursor pagination

**Files:**
- Create: `server/internal/article/service.go`, `server/internal/article/handler.go`, `server/internal/article/service_test.go`
- Modify: router

**Endpoints per spec §8.4:**
- `GET /api/articles?tab=today|stream|starred&source_id=&q=&cursor=`
- `GET /api/articles/:id`
- `PATCH /api/articles/:id/state` — `{is_read?, is_starred?}`
- `PUT /api/articles/:id/progress` — `{scroll_percent, paragraph_index, updated_at}`
- `POST /api/articles/batch/state` — `{scope: "source:N"|"tab:today", is_read: true}`
- `GET /api/articles/changes?since=<iso>` — polling endpoint

**Curation rules (v1):**
- `today` = `published_at >= now() - interval '24 hours'`, ordered by `published_at DESC`, limit 100
- `stream` = everything non-deleted, cursor-paginated by `(published_at, id) DESC`
- `starred` = filter on `article_states.is_starred = true`

**Key tests:**

```go
func TestArticles_Today_Returns24hWindow(t *testing.T) { ... }
func TestArticles_Stream_CursorAdvancesForward(t *testing.T) { ... }
func TestArticles_State_ScopeSourceN_MarksAll(t *testing.T) { ... }
func TestArticles_ChangesSince_ReturnsNewStatesOnly(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement. Each endpoint returns `{items, next_cursor}` per spec §8.8.
- [ ] Step 3: Tests PASS. Manually verify with curl.
- [ ] Step 4: Commit `git commit -m "feat(article): list/detail/state API with tabs and pagination"`

### Task 3.3 — OPML import (async job + progress)

**Files:**
- Create: `server/internal/source/opml.go`, `server/internal/source/opml_import_service.go`, `server/internal/source/opml_test.go`, `server/internal/platform/jobs.go`
- Modify: router (POST `/api/sources/import-opml`, GET `/api/jobs/:id`)

**Implementation notes:**

- Parse OPML 2.0 with standard `encoding/xml` into a nested structure of folders → feeds.
- Import is async: POST returns immediately with `{job_id}`, client polls `GET /api/jobs/:id`. Job state stored in Redis with 1-hour TTL: `{status, progress: N/M, succeeded, failed, skipped}`.
- Skip policy: if a (user_id, normalized_url) already exists (even soft-deleted), count as `skipped`.
- Folder structure is preserved into a new `folder_id` field on sources (add via a small migration 004).

**Key tests:**

```go
func TestOPML_ParseNestedFolders(t *testing.T) { ... }
func TestOPML_Import_SkipsExistingAndCountsEach(t *testing.T) { ... }
func TestJobs_GET_ReturnsLiveProgress(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Add migration 004 adding `folder_id` to sources + `folders` table. sqlc-generate.
- [ ] Step 2: Write parser tests with fixture OPML. FAIL.
- [ ] Step 3: Implement parser + import job + jobs endpoint.
- [ ] Step 4: Tests PASS. Manual: upload a 50-feed OPML; watch progress.
- [ ] Step 5: Commit `git commit -m "feat(source): OPML import async job with progress"`

### Task 3.4 — OPML export

**Files:**
- Create: `server/internal/source/opml_export.go`, `server/internal/source/opml_export_test.go`

**Endpoint:** `GET /api/sources/export-opml` returns `text/x-opml`.

**Key tests:**

```go
func TestOPMLExport_RoundtripsWithImport(t *testing.T) {
    // Import fixture → Export → parse → structurally equivalent.
}
```

**Steps:**
- [ ] Step 1: Test. FAIL.
- [ ] Step 2: Implement generator via `encoding/xml`.
- [ ] Step 3: Commit `git commit -m "feat(source): OPML export"`

### Task 3.5 — Full-text search endpoint

**Files:**
- Modify: `server/internal/article/service.go` (wire search via `?q=` on list endpoint)
- Create: `server/internal/article/search_test.go`

**Implementation notes:**

- Search uses `search_vec @@ plainto_tsquery('simple', :q)` against `articles`.
- Return `headline` snippet using `ts_headline` with 6 words context on either side of the match.
- Limit 100 results (no cursor in v1; paginate in Phase 2).

**Key tests:**

```go
func TestSearch_MatchesTitleAndBody(t *testing.T) { ... }
func TestSearch_ReturnsHeadlineSnippet(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Commit `git commit -m "feat(article): FTS search with headline snippet"`

---

## Sprint 4 — AI pipeline (OpenAI-compatible client + eager + lazy)

Produces: Newly fetched articles get their titles translated and 要点 summaries generated; opening an article detail streams in body translation paragraph by paragraph via SSE.

### Task 4.1 — DB migration 005: article_ai

**Files:**
- Create: `server/db/migrations/005_article_ai.up.sql`, `.down.sql`, `server/db/queries/article_ai.sql`

**Implementation notes:**

Schema exactly per spec §7.1 (`article_ai` with composite PK `(article_id, target_language)`). `body_translation_content` is `jsonb` storing `[{paragraph_index: int, original: string, translation: string}]`.

**Steps:**
- [ ] Step 1: Write migration + queries (UpsertSummary, UpsertTitleTranslation, GetByArticleAndLang, SetBodyStatus, AppendBodyParagraph).
- [ ] Step 2: sqlc-generate.
- [ ] Step 3: Quick insert/read test.
- [ ] Step 4: Commit `git commit -m "feat(db): migration 005 article_ai"`

### Task 4.2 — AI config loader + OpenAI-compatible HTTP client

**Files:**
- Create: `server/internal/ai/config.go`, `server/internal/ai/config_test.go`, `server/internal/ai/client.go`, `server/internal/ai/client_test.go`, `server/internal/ai/mock.go`, `config/ai.example.yaml`

**Implementation notes:**

- `LoadConfig(path string) (Config, error)`: reads YAML from path (env `XREADER_AI_CONFIG`, default `./config/ai.yaml`). Struct mirrors spec §6.3.3 exactly.
- API key read from env var named in config (`api_key_env`), NOT from the YAML itself. This keeps the YAML safe to commit in a private ops repo.
- `Client` implements `ChatCompletion(ctx, ChatRequest) (ChatResponse, error)` by `POST {base_url}/chat/completions` with `Authorization: Bearer <key>`. JSON shape matches OpenAI's `/v1/chat/completions`.
- Retries: exponential backoff (`1s, 2s, 4s`) on `429/5xx/network`, up to `max_retries`.
- Timeout from config.
- Emits structured logs including request ID, model, latency, token usage (from response).

**Key tests:**

```go
func TestLoadConfig_ReadsYAML(t *testing.T) {
    // Write a temp yaml, load, assert all fields.
}

func TestLoadConfig_ResolvesAPIKeyFromEnv(t *testing.T) {
    t.Setenv("MY_KEY_VAR", "sk-test-123")
    cfg, _ := LoadConfig(writeTempYAML(t, `provider:\n  api_key_env: MY_KEY_VAR\n`))
    require.Equal(t, "sk-test-123", cfg.APIKey())
}

func TestClient_SendsCorrectOpenAIShape(t *testing.T) {
    srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        require.Equal(t, "Bearer sk-xxx", r.Header.Get("Authorization"))
        var body map[string]any
        _ = json.NewDecoder(r.Body).Decode(&body)
        require.Equal(t, "my-model", body["model"])
        w.Write([]byte(`{"choices":[{"message":{"content":"hi"}}]}`))
    }))
    c := NewClient(Config{BaseURL: srv.URL, Key: "sk-xxx"})
    resp, _ := c.ChatCompletion(ctx, ChatRequest{Model: "my-model", Messages: []ChatMessage{{Role: "user", Content: "hello"}}})
    require.Equal(t, "hi", resp.Content)
}

func TestClient_RetriesOn429(t *testing.T) { /* first call 429, second call 200 */ }
```

**Steps:**
- [ ] Step 1: `go get gopkg.in/yaml.v3`
- [ ] Step 2: Write `config/ai.example.yaml` per spec §6.3.3.
- [ ] Step 3: Tests. FAIL.
- [ ] Step 4: Implement `Config`, `Client`, `MockClient` (configurable responses for tests).
- [ ] Step 5: Tests PASS.
- [ ] Step 6: Commit `git commit -m "feat(ai): OpenAI-compatible client with config loader"`

### Task 4.3 — Eager AI pipeline: title translation + 要点 summary

**Files:**
- Create: `server/internal/ai/pipeline.go`, `server/internal/ai/pipeline_test.go`, `server/internal/ai/prompts.go`, `server/internal/ai/language.go`, `server/internal/ai/language_test.go`
- Modify: `server/internal/sync/worker.go` (after fetching + inserting articles, enqueue eager AI jobs)

**Implementation notes:**

- `DetectLanguage(text string) string` — BCP-47 output (e.g., "zh-CN", "en-US", "ja-JP"). Use `github.com/abadojack/whatlanggo` + mapping to BCP-47. Fall back to `source.language_hint`.
- `EagerJob` per `(article_id, target_language)` pair:
  1. If article language matches target language → skip title translation (`title_translated = title`); still generate summary.
  2. If `len(content_text) < 280` → skip summary (`summary_status = 'skipped'`, `summary_skip_reason = 'short'`).
  3. Otherwise: one API call for title translation, one API call for summary (prompts per spec §6.3.1).
- Fan-out: for each new article, read the distinct set of native languages from `users` table, enqueue one `EagerJob` per `(article, lang)`.
- `prompts.go` has `TitleTranslationPrompt(targetLang)` and `SummaryPrompt(targetLang)` returning the i18n template. Ship `zh-CN` and `en-US` prompts v1.

**Key tests:**

```go
func TestLanguageDetect_ChineseText(t *testing.T) { ... }
func TestLanguageDetect_ShortTextFallsBackToSourceHint(t *testing.T) { ... }

func TestEagerJob_SameLanguage_SkipsTitleTranslation(t *testing.T) {
    job := newJobWithMockAI(t, articleLang: "zh-CN", targetLang: "zh-CN", body: longChineseText)
    require.NoError(t, job.Run(ctx))
    ai := loadArticleAI(t, job.ArticleID, "zh-CN")
    require.Equal(t, job.OriginalTitle, ai.TitleTranslated) // same
    require.NotEmpty(t, ai.Summary)
    require.Equal(t, "done", ai.SummaryStatus)
}

func TestEagerJob_ShortItem_SkipsSummary(t *testing.T) {
    job := newJobWithMockAI(t, body: "just a tweet", ...)
    require.NoError(t, job.Run(ctx))
    ai := loadArticleAI(t, job.ArticleID, job.TargetLang)
    require.Equal(t, "skipped", ai.SummaryStatus)
    require.Equal(t, "short", ai.SummarySkipReason)
}

func TestEagerJob_TranslatesTitleAndGeneratesSummary_HappyPath(t *testing.T) { ... }
func TestEagerJob_RecordsFailure_AllowsRetry(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Install whatlanggo. Write language detection test + impl.
- [ ] Step 2: Write prompts file (zh-CN + en-US versions of spec §6.3.1 prompts).
- [ ] Step 3: Write pipeline tests. FAIL.
- [ ] Step 4: Implement `EagerJob`. Wire into worker: after `FetchJob` inserts articles, it publishes `article:new` with IDs; a separate eager-consumer reads them and enqueues `EagerJob`s.
- [ ] Step 5: Tests PASS. Manual: add a source with a foreign-language article; after worker cycle, `article_ai` row exists with translated title + Chinese 要点.
- [ ] Step 6: Commit `git commit -m "feat(ai): eager title translation + summary pipeline"`

### Task 4.4 — Lazy body translation + SSE endpoint

**Files:**
- Create: `server/internal/ai/lazy_job.go`, `server/internal/ai/lazy_job_test.go`, `server/internal/article/sse_handler.go`, `server/internal/article/sse_test.go`
- Modify: router (wire `GET /api/articles/:id/body-translation`)

**Implementation notes:**

- `LazyJob`: splits `article.content_html` into post-sanitization paragraphs (preserves `<p>`, `<h2>`, `<li>`; others flattened), translates requested paragraph ranges in batches of `batch_paragraphs_per_call` via a single API call (the prompt asks the model to translate each numbered paragraph in order; parse output).
- Job publishes each translated paragraph to Redis pub/sub channel `ai:body:<article_id>:<target_lang>` as JSON. When done, publishes a `done` marker and persists full result.
- SSE endpoint `GET /api/articles/:id/body-translation`:
  - Supports optional `start` and `count` query params. The frontend uses these for viewport-driven lazy translation: current paragraph + the next 4 paragraphs.
  - If requested paragraphs are cached in `article_ai.body_translation_content` → stream cached paragraph events immediately.
  - If requested paragraphs are missing → translate only the missing paragraphs, stream them, then merge them into the JSON cache.
  - Keep `body_translation_status = 'processing'` while the cache is partial; set `done` only when every paragraph has a valid cached translation.
  - On client disconnect → unsubscribe; job continues regardless.
- SSE event format: `data: {"type":"paragraph","index":3,"original":"...","translation":"..."}\n\n` then a final `data: {"type":"done"}\n\n`.

**Key tests:**

```go
func TestLazyJob_TranslatesAllParagraphsAndPersists(t *testing.T) { ... }

func TestLazyJob_SingleFlight_SecondCallAttachesToExistingRun(t *testing.T) {
    // Start two LazyJobs concurrently; assert the AI client was called the same number of times as one run.
}

func TestSSE_ServesCachedTranslationImmediately(t *testing.T) {
    // Pre-populate article_ai with body_translation_status='done'; hit endpoint; expect single event + close.
}

func TestSSE_StreamsFromPubSubDuringProcessing(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Paragraph splitter function (`SplitParagraphs(html string) []Paragraph`) + its tests.
- [ ] Step 2: `LazyJob` tests. FAIL.
- [ ] Step 3: Implement `LazyJob` with batching + pub/sub publishing.
- [ ] Step 4: SSE handler tests. FAIL.
- [ ] Step 5: Implement SSE handler using `c.Stream(...)` pattern in Gin.
- [ ] Step 6: Manual test: open `/api/articles/42/body-translation` in the browser; watch paragraphs stream in. Second open from another tab attaches to the same run; verify via AI-client call count.
- [ ] Step 7: Commit `git commit -m "feat(ai): lazy body translation via SSE with single-flight"`

### Task 4.5 — Retry endpoint + highlight orphaning on retranslate

**Files:**
- Create: `server/internal/article/body_retry_handler.go`, `server/internal/article/body_retry_test.go`
- Modify: `server/internal/ai/lazy_job.go` (add "preserve or orphan highlights" logic)

**Endpoint:** `POST /api/articles/:id/body-translation/retry` — admin or owner only; resets `body_translation_status = 'none'`, deletes old content, marks translation-layer highlights orphaned if paragraph count changes.

**Key tests:**

```go
func TestBodyRetry_PreservesHighlightsWhenParagraphCountMatches(t *testing.T) { ... }
func TestBodyRetry_OrphansTranslationHighlightsOnParagraphCountChange(t *testing.T) { ... }
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Commit `git commit -m "feat(ai): retranslate with highlight preservation"`

---

## Sprint 5 — Frontend feed page

Produces: A working `/` page that, after login, renders the user's feed in both Comfortable and Compact density modes matching mockups 01 and 02 pixel-by-pixel.

### Task 5.1 — API client + auth flow + React Query provider

**Files:**
- Create: `web/src/lib/api-client.ts`, `web/src/lib/api-client.test.ts`, `web/src/stores/useAuthStore.ts`, `web/src/components/Providers.tsx`, `web/app/layout.tsx` (wrap with providers), `web/app/(auth)/login/page.tsx`, `web/app/(auth)/callback/page.tsx`

**Implementation notes:**

- `api-client.ts`: `fetch` wrapper with `credentials: 'include'`, sets `X-Requested-With: xhr` header on every write, throws typed `ApiError` with `code/message` on non-2xx. Auto-redirects to `/login` on 401.
- `useAuthStore`: Zustand slice holding `{user: User | null, isLoading, fetchMe, logout}`. Calls `GET /api/auth/me` on mount.
- `Providers.tsx` wraps children in QueryClientProvider with sensible defaults (staleTime 60s for feed lists, gcTime 5m).
- `/login` page: "Sign in with GitHub" button → `window.location = '/api/auth/github'`.
- `/callback` page: shows spinner; auth store polls `/api/auth/me`; on success redirects to `/`.

**Key tests:**

```ts
import { apiFetch, ApiError } from './api-client';

test('apiFetch throws ApiError with code on 400', async () => {
  globalThis.fetch = vi.fn(async () => new Response(
    JSON.stringify({ code: 'VALIDATION_ERROR', message: 'bad' }),
    { status: 400 }
  )) as any;
  await expect(apiFetch('/x')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

test('apiFetch redirects to /login on 401', async () => {
  const loc = { href: '' } as any;
  vi.stubGlobal('location', loc);
  globalThis.fetch = vi.fn(async () => new Response('', { status: 401 })) as any;
  await apiFetch('/x').catch(() => {});
  expect(loc.href).toBe('/login');
});
```

**Steps:**
- [ ] Step 1: `pnpm add zustand @tanstack/react-query`
- [ ] Step 2: Tests. FAIL.
- [ ] Step 3: Implement files.
- [ ] Step 4: Manual: visit `/`, redirect to `/login`, sign in, land back at `/` with user loaded.
- [ ] Step 5: Commit `git commit -m "feat(web): API client + auth flow + React Query"`

### Task 5.2 — Zustand UI store (density, theme, native language override)

**Files:**
- Create: `web/src/stores/useUIStore.ts`, `web/src/stores/useUIStore.test.ts`

**Implementation notes:**

- `density: 'comfortable' | 'compact'` — persisted to localStorage on change, also PATCH'd to `/api/users/me` as `density_pref`.
- `theme: 'light' | 'dark' | 'system'` — localStorage + PATCH.
- Initial values hydrated from the `/api/auth/me` response (`density_pref`, `theme_pref`, `native_language`).
- `toggleDensity()` flips 舒适 ↔ 紧凑 and persists.

**Key tests:**

```ts
test('toggleDensity flips value and persists to localStorage', () => {
  useUIStore.setState({ density: 'comfortable' });
  useUIStore.getState().toggleDensity();
  expect(useUIStore.getState().density).toBe('compact');
  expect(localStorage.getItem('xreader:density')).toBe('compact');
});
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Commit `git commit -m "feat(web): UI store for density and theme"`

### Task 5.3 — Feed page route, tabs, data fetching

**Files:**
- Create: `web/app/(app)/page.tsx`, `web/app/(app)/layout.tsx`, `web/src/components/feed/FeedTabs.tsx`, `web/src/components/feed/FeedList.tsx`, `web/src/components/feed/FeedList.test.tsx`, `web/src/components/feed/DensityToggle.tsx`, `web/src/lib/queries/articles.ts`

**Implementation notes:**

- `/` is the feed route under `(app)` layout (which checks auth).
- Tabs: 今日 / 全部 / 收藏 driven by URL query `?tab=today|stream|starred` (default `today`). Tab switching updates the URL.
- Data fetch: `useInfiniteQuery` against `GET /api/articles?tab=...&cursor=...`. Intersection observer triggers `fetchNextPage` when sentinel enters viewport.
- Layout: horizontal tabs bar at top (left), density toggle + native-language chip at top-right — matches mockup 01 chrome exactly.
- Empty state: "还没有订阅任何源 · 立刻添加一个" with a link to `/sources`.

**Key tests:**

```tsx
test('FeedList renders items from API and shows empty state when no data', async () => {
  server.use(rest.get('/api/articles', (_, res, ctx) =>
    res(ctx.json({ items: [], next_cursor: null }))
  ));
  render(<FeedList tab="today" density="comfortable" />);
  expect(await screen.findByText(/还没有订阅/)).toBeInTheDocument();
});

test('FeedTabs updates URL on click', async () => {
  const user = userEvent.setup();
  render(<FeedTabs />);
  await user.click(screen.getByText('全部'));
  expect(window.location.search).toContain('tab=stream');
});
```

**Steps:**
- [ ] Step 1: `pnpm add @tanstack/react-query`-already installed, add `react-intersection-observer`.
- [ ] Step 2: Tests. FAIL.
- [ ] Step 3: Implement components + query hooks + page route.
- [ ] Step 4: Manual: feed list loads with real backend data.
- [ ] Step 5: Commit `git commit -m "feat(web): feed page with tabs and infinite scroll"`

### Task 5.4 — Comfortable row component (mockup 01 match)

**Files:**
- Create: `web/src/components/feed/FeedRowComfortable.tsx`, `web/src/components/feed/FeedRowComfortable.test.tsx`

**Implementation notes:**

Match `docs/superpowers/specs/mockups/01-feed-comfortable.html` exactly:

- Row padding 20px top/bottom, border-bottom `#ece6d8`.
- Top metadata row (12px system-ui, muted) with source badge + source name + time + language tag (e.g. `EN → 中`).
- Title line: 22px `Iowan Old Style, Georgia, serif`, `#1f1f1f`.
- Original-title line (italic, muted, 12px) — **only render when `title !== title_translated`**.
- 要点 line: system-ui 14px; label `要点` in 11px uppercase tracked, color `#8a8275`, inline with summary text; entire line `line-height: 1.6`, color `#4a4338`.
- Short items (no summary) render the content text inline + italic original-text block beneath.
- On click → route to `/read/{id}?ctx={tab}&filter={...}` (captures the filter context for prev/next).

**Key tests:**

```tsx
test('renders translated title with original muted below when translated', () => {
  render(<FeedRowComfortable item={mockItemTranslated} />);
  expect(screen.getByText(/为什么我把家用服务器/)).toBeInTheDocument();
  expect(screen.getByText(/nixosサーバー管理/)).toBeInTheDocument();
});

test('does not render original title when article is native-language', () => {
  render(<FeedRowComfortable item={mockItemNative} />);
  expect(screen.queryByText(/原标题/)).not.toBeInTheDocument();
});

test('renders 要点 inline when summary is present', () => {
  render(<FeedRowComfortable item={withSummary} />);
  expect(screen.getByText('要点')).toBeInTheDocument();
});

test('omits 要点 for short items', () => {
  render(<FeedRowComfortable item={shortItem} />);
  expect(screen.queryByText('要点')).not.toBeInTheDocument();
});
```

**Steps:**
- [ ] Step 1: Set up the serif font stack in Tailwind config (`fontFamily.serif`).
- [ ] Step 2: Tests (including visual snapshot against the mockup if using Storybook — optional). FAIL.
- [ ] Step 3: Implement component using Tailwind + the exact tokens from spec §9.
- [ ] Step 4: Visual comparison: open `/` in a browser, toggle to Comfortable mode, side-by-side with `mockups/01-feed-comfortable.html`. Must match.
- [ ] Step 5: Commit `git commit -m "feat(web): FeedRowComfortable matching mockup 01"`

### Task 5.5 — Compact row component + density toggle wiring

**Files:**
- Create: `web/src/components/feed/FeedRowCompact.tsx`, `web/src/components/feed/FeedRowCompact.test.tsx`
- Modify: `FeedList.tsx` to switch rows based on `useUIStore().density`

**Implementation notes:**

Match `docs/superpowers/specs/mockups/02-feed-compact.html` exactly — row layout is:

```
[title .................. flex-grow] [source badge] margin-left:auto [time/meta]
```

- Row padding `10px` top/bottom, gap `10px`, `align-items: baseline`.
- Title: 14px system-ui, `#1f1f1f`, `font-weight: 500`. Single line, wraps only if truly needed (overflow: hidden + text-ellipsis for truncation risk).
- Source badge: bg per source type (use consistent map from spec §9), text dark/light per bg.
- Time/meta: 11px muted, right-pinned via `margin-left: auto`.
- Hover: reveal 要点 as a tooltip (floating popover). Spacebar on selected row does the same without navigating.

**Key tests:**

```tsx
test('renders [title] [badge] then metadata pushed right', () => {
  const { container } = render(<FeedRowCompact item={mockItem} />);
  const children = Array.from(container.firstChild!.childNodes);
  expect(children[0]).toHaveTextContent(/title/);
  expect((children[children.length - 1] as HTMLElement).style.marginLeft).toBe('auto');
});
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement Compact row + Density toggle wiring in `FeedList.tsx`.
- [ ] Step 3: Visual match against mockup 02.
- [ ] Step 4: Commit `git commit -m "feat(web): FeedRowCompact and density toggle wiring"`

---

## Sprint 6 — Reader + highlights

Produces: A `/read/[id]` route that renders articles with alternating-paragraph bilingual body (streaming-in translation on first open), 要点 callout, prev/next sticky bar, next-up card, highlighting, and notes.

### Task 6.1 — Reader shell + metadata header + 要点 callout

**Files:**
- Create: `web/app/(app)/read/[id]/page.tsx`, `web/src/components/reader/ReaderHeader.tsx`, `web/src/components/reader/KeyPointsCallout.tsx`, `web/src/components/reader/KeyPointsCallout.test.tsx`

**Implementation notes:**

- Reader page reads `?ctx` and `?filter` query to remember the entry context. Stores it in `useReaderStore` for use by prev/next.
- Header layout: `← 返回 Feed` · `2 / 142 · 📰 source · lang → lang` · action icons (⭐ 🖍 📝 🔗) per mockup 03.
- Title: 32px serif. Original title (italic muted, 13px) below, only if article language ≠ user native.
- 要点 callout: bg `#fff8e6`, border-left 3px `#d4a24c`, label `要点` (10px uppercase tracked `#a07a20`), body text `#3b3628` 14px line-height 1.6.

**Key tests:**

```tsx
test('KeyPointsCallout renders bullet summary when multiple bullets provided', () => {
  render(<KeyPointsCallout text="① aaa ② bbb ③ ccc" />);
  expect(screen.getByText(/aaa/)).toBeInTheDocument();
});
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Match mockup 03 header + callout visually.
- [ ] Step 4: Commit `git commit -m "feat(web): Reader header + 要点 callout"`

### Task 6.2 — BilingualBody with alternating paragraphs + SSE lazy-translation

**Files:**
- Create: `web/src/components/reader/BilingualBody.tsx`, `web/src/components/reader/BilingualBody.test.tsx`, `web/src/lib/sse-client.ts`

**Implementation notes:**

- Fetches `GET /api/articles/:id/body-translation?start={index}&count={window}` as SSE using `EventSource`.
- Renders the article's post-sanitization paragraphs as HTML elements. For each paragraph:
  - First render: `[original paragraph, muted #6a6252]`.
  - When SSE delivers a `paragraph` event for this index → render `[translation paragraph, #1f1f1f]` directly below.
- Uses `IntersectionObserver` to request translation when a paragraph approaches the viewport; default prefetch window is the current paragraph plus the next 4 paragraphs.
- For native-language articles (article lang === target lang): show only the original, no translation.
- Language-aware serif: pick font family by article language (map in `src/lib/langFonts.ts`: `ja → "Hiragino Mincho ProN", Georgia, serif`; `zh → "Source Han Serif", Georgia, serif`; default serif otherwise).
- Loading affordance: while waiting for a requested paragraph's translation, show a faint 3-dot pulse below that paragraph.
- On `done` event, close the EventSource.

**Key tests:**

```tsx
test('renders original paragraphs immediately, then translations as they arrive', async () => {
  const fakeSSE = mockEventSource();
  render(<BilingualBody articleId={1} paragraphs={mockParagraphs} targetLang="zh-CN" />);
  expect(screen.getByText(/original paragraph 1/)).toBeInTheDocument();
  fakeSSE.push({ type: 'paragraph', index: 0, translation: '第一段翻译' });
  expect(await screen.findByText(/第一段翻译/)).toBeInTheDocument();
});

test('does not render translation layer for native-language article', () => { ... });
```

**Steps:**
- [ ] Step 1: Implement `sse-client.ts` (thin wrapper around EventSource with reconnection).
- [ ] Step 2: Tests. FAIL.
- [ ] Step 3: Implement `BilingualBody` consuming the SSE client.
- [ ] Step 4: Manual: open an article with body_translation_status='none'; verify original renders immediately, translations stream in.
- [ ] Step 5: Commit `git commit -m "feat(web): BilingualBody with SSE-streamed translation"`

### Task 6.3 — Prev/next sticky bar + end-of-article "Next up" card + auto-mark-read on navigation

**Files:**
- Create: `web/src/components/reader/PrevNextBar.tsx`, `web/src/components/reader/NextUpCard.tsx`, `web/src/components/reader/PrevNextBar.test.tsx`, `web/src/lib/queries/neighbors.ts`

**Implementation notes:**

- A helper hook `useArticleNeighbors(currentId, ctx, filter)` calls `GET /api/articles?ctx=...&filter=...&cursor_around=<id>` (add this query path if not yet implemented — it returns `{prev: Article, current: Article, next: Article, position: 2, total: 142}`). For simplicity, the API can return the current page +/- 1 around the article; the frontend extracts neighbors from that.
- Sticky bar: layout from mockup 03: `← K · 上一篇 · <truncate title>` on left; position indicator center; `<truncate title> · 下一篇 · J →` on right. Both sides clickable.
- Next-up card: always shown at the end of the article body (even if short), styled per mockup 03.
- Clicking any "next" control OR pressing J/→: calls `PATCH /api/articles/:id/state` with `{is_read: true}` in the background, then navigates to next article via `router.push`.

**Key tests:**

```tsx
test('clicking next calls mark-read and navigates', async () => {
  const push = vi.fn();
  (useRouter as any).mockReturnValue({ push });
  const patch = vi.fn();
  render(<PrevNextBar current={a} prev={b} next={c} markRead={patch} />);
  await userEvent.click(screen.getByText(/下一篇/));
  expect(patch).toHaveBeenCalledWith(a.id);
  expect(push).toHaveBeenCalledWith(expect.stringContaining('/read/' + c.id));
});
```

**Steps:**
- [ ] Step 1: Backend: extend articles API with `?cursor_around=` variant (small server task; add a test there).
- [ ] Step 2: Frontend tests. FAIL.
- [ ] Step 3: Implement components.
- [ ] Step 4: Visual: match mockup 03 sticky bar + next-up card.
- [ ] Step 5: Commit `git commit -m "feat(web): prev/next bar + next-up card + auto-mark-read"`

### Task 6.4 — Highlights: select text → floating toolbar → save → render persistent + notes

**Files:**
- Create: `web/src/components/reader/HighlightLayer.tsx`, `web/src/components/reader/HighlightToolbar.tsx`, `web/src/components/reader/HighlightLayer.test.tsx`, `web/src/lib/queries/highlights.ts`
- Backend: `server/internal/highlight/service.go`, `server/internal/highlight/handler.go`, `service_test.go`

**Implementation notes:**

Backend:
- Endpoints per spec §8.5.
- Highlight anchor scheme: `{layer: 'original'|'translation', paragraph_index: int, text_start_offset: int, text_end_offset: int, quoted_text: string}`. Server validates offsets against the paragraph's actual text (from `article.content_text` or `article_ai.body_translation_content[index]`); reject if `quoted_text ≠ substring(paragraph, start, end)`.

Frontend:
- On text selection within `<BilingualBody>`, compute the paragraph index + offsets from the selection's start/end nodes (walk up to the nearest `[data-paragraph-index]` element).
- Show floating toolbar: `高亮` | `高亮 + 笔记`. Clicking saves via `POST /api/highlights`.
- After save, re-render the paragraph with `<mark>` wrapping the highlighted range.
- On load, fetch all highlights for the article and render them inline.
- Long-press / right-click on an existing `<mark>`: edit note, delete, copy.

**Key tests:**

```tsx
test('computes offsets relative to paragraph text', () => {
  const p = document.createElement('p');
  p.setAttribute('data-paragraph-index', '3');
  p.textContent = 'Hello world friend';
  document.body.appendChild(p);
  const range = pickRange(p, 6, 11); // select "world"
  const anchor = computeAnchor(range);
  expect(anchor).toEqual({ paragraph_index: 3, text_start_offset: 6, text_end_offset: 11, quoted_text: 'world' });
});

// Backend
func TestHighlight_RejectsMismatchedText(t *testing.T) { /* saves {quoted_text:"x"} but substring is "y" → 400 */ }
```

**Steps:**
- [ ] Step 1: DB: migration 006 for `highlights` table (schema from spec §7.1). sqlc-generate.
- [ ] Step 2: Backend tests + implementation.
- [ ] Step 3: Frontend selection-to-anchor computation tests + impl.
- [ ] Step 4: Frontend toolbar + persistence.
- [ ] Step 5: Manual: highlight text, refresh, highlight still there; add note; delete highlight.
- [ ] Step 6: Commit `git commit -m "feat(highlight): create/delete/note with offset-based anchoring"`

### Task 6.5 — Highlights listing page + search

**Files:**
- Create: `web/app/(app)/highlights/page.tsx`, `web/src/components/highlights/HighlightsList.tsx`

**Endpoint:** `GET /api/highlights?q=&source_id=&article_id=&cursor=` — list with snippets and jump-to-article links.

**Steps:**
- [ ] Step 1: Backend endpoint with query + pagination.
- [ ] Step 2: Frontend page with search and filter.
- [ ] Step 3: Clicking a highlight → navigates to `/read/{article_id}#highlight-{id}` → reader scrolls to anchor.
- [ ] Step 4: Commit `git commit -m "feat(highlight): listing page with search and jump-to-article"`

---

## Sprint 7 — Settings + admin + multi-tab sync + sources management UI

Produces: Every management surface the user needs lives in a UI. Multi-tab state stays consistent.

### Task 7.1 — Settings page (native language, density, theme)

**Files:**
- Create: `web/app/(app)/settings/page.tsx`, `web/src/components/settings/NativeLanguagePicker.tsx`, `web/src/components/settings/ThemePicker.tsx`

**Implementation notes:**

- Native language dropdown: zh-CN / zh-TW / en-US / ja-JP / ko-KR at minimum. Save PATCHes `/api/users/me` and invalidates React Query caches that depend on translations (articles, highlights).
- Theme picker: 浅色 / 深色 / 跟随系统.
- Changing native language triggers a warning: "切换母语后，已生成的翻译结果需要重新生成才会显示新语言。已有文章的翻译不会自动重翻。" with a checkbox to re-enqueue all lazy translations.

**Steps:**
- [ ] Step 1: Backend: add the `PATCH /api/users/me` endpoint accepting `{native_language?, density_pref?, theme_pref?}`. Test.
- [ ] Step 2: Frontend tests (language change triggers cache invalidation). FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Commit `git commit -m "feat(settings): settings page with native language, density, theme"`

### Task 7.2 — Sources management page

**Files:**
- Create: `web/app/(app)/sources/page.tsx`, `web/src/components/sources/SourceList.tsx`, `web/src/components/sources/AddSourceModal.tsx`, `web/src/components/sources/OPMLImportButton.tsx`

**Behavior:**
- List sources with title, URL, last-fetched, health indicator.
- Add: URL field + auto-detect title via `POST /api/sources`.
- Delete: soft-delete with a 5-second toast-undo.
- OPML import: file upload → show progress by polling `/api/jobs/:job_id`.
- OPML export: download link.
- Inline rename.

**Steps:**
- [ ] Step 1: Component tests (add, delete + undo, progress polling). FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Manual: full CRUD including OPML roundtrip.
- [ ] Step 4: Commit `git commit -m "feat(sources): management UI with OPML import/export"`

### Task 7.3 — Admin allowlist UI

**Files:**
- Create: `web/app/(app)/admin/page.tsx`, `web/src/components/admin/AllowlistTable.tsx`

**Behavior:**
- Admin-only route (check `user.role` in the `(app)/layout.tsx`; redirect non-admins).
- Table of allowlisted GitHub usernames with Add and Remove.

**Steps:**
- [ ] Step 1: Tests (non-admin redirect, CRUD). FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Commit `git commit -m "feat(admin): allowlist management UI"`

### Task 7.4 — Multi-tab sync (BroadcastChannel) + cross-device polling

**Files:**
- Create: `web/src/lib/broadcast.ts`, `web/src/lib/broadcast.test.ts`, `web/src/hooks/useCrossDevicePoll.ts`

**Implementation notes:**

- BroadcastChannel `xreader` broadcasts local state mutations (read/starred) so other tabs in the same browser update instantly via React Query cache setQueryData.
- Cross-device: hook calls `/api/articles/changes?since=<iso>` every 30s when the tab is visible; applies to the query cache.
- Deduplicate: if a change originated in this tab (echoed back via polling), ignore.

**Steps:**
- [ ] Step 1: Tests for the broadcast wrapper (mock BroadcastChannel).
- [ ] Step 2: Implement; wire into the mark-read / star mutations.
- [ ] Step 3: Manual: open two tabs side-by-side; star an item in tab A → tab B updates within 1s.
- [ ] Step 4: Commit `git commit -m "feat(sync): BroadcastChannel + cross-device polling"`

---

## Sprint 8 — Polish + deploy

Produces: Production-ready app with dark mode, responsive mobile, full keyboard shortcut system, E2E coverage of the critical paths, and a repeatable deployment.

### Task 8.1 — Dark mode + mobile responsive

**Files:**
- Modify: `web/tailwind.config.ts` (dark mode via `class` strategy + CSS variables), `web/app/layout.tsx` (apply theme class), all feed/reader components (add dark variants)

**Implementation notes:**

- Use CSS custom properties (`--bg-body`, `--text-body`, `--muted`, `--callout-bg`, ...) defined in `app/globals.css` with light + dark `@media (prefers-color-scheme)` + manual override via a `.theme-dark` class on `<html>`.
- Dark tokens per spec §9 (newly resolved): `#0f0f10` body bg, `#e8e8e8` body text.
- Mobile:
  - Feed Comfortable: title size drops to 18px; row padding tightens. Badge + metadata stack onto two lines.
  - Feed Compact: titles keep single-line with ellipsis.
  - Reader: body stays 16px, padding reduces to 20px side, hide desktop sticky chevrons.
  - No swipe navigation; tap-only next/prev.

**Steps:**
- [ ] Step 1: Define CSS variables + light/dark mappings.
- [ ] Step 2: Update each component to use tokens.
- [ ] Step 3: Manual responsive test at 375/768/1280 widths.
- [ ] Step 4: Commit `git commit -m "feat(web): dark mode + mobile responsive"`

### Task 8.2 — Keyboard shortcut system

**Files:**
- Create: `web/src/lib/keyboard.ts`, `web/src/lib/keyboard.test.ts`, `web/src/hooks/useShortcuts.ts`

**Implementation notes:**

- Global dispatcher: map event → action. Skip when focus is in an input/textarea/contenteditable.
- Register per-page: `/` page registers feed shortcuts (J/K/Enter/E/S/C/slash/g-t/g-s/g-f); `/read/:id` page registers reader shortcuts (J/K/→/←/S/H/N/T/O/E/Esc).
- Two-key chords (e.g., `g t`): track pending prefix with a 1-second window.

**Key tests:**

```ts
test('J key triggers next action', () => {
  const handler = vi.fn();
  registerShortcut('j', handler);
  dispatchKey('j');
  expect(handler).toHaveBeenCalled();
});

test('ignored when focused in input', () => {
  const handler = vi.fn();
  registerShortcut('j', handler);
  const input = document.createElement('input');
  document.body.appendChild(input);
  input.focus();
  dispatchKey('j');
  expect(handler).not.toHaveBeenCalled();
});
```

**Steps:**
- [ ] Step 1: Tests. FAIL.
- [ ] Step 2: Implement.
- [ ] Step 3: Wire into feed + reader pages with the spec's shortcut list.
- [ ] Step 4: Commit `git commit -m "feat(web): global keyboard shortcut system"`

### Task 8.3 — End-to-end tests (Playwright)

**Files:**
- Create: `web/e2e/login.spec.ts`, `web/e2e/add-source-and-read.spec.ts`, `web/e2e/highlight-persists.spec.ts`, `web/e2e/prev-next.spec.ts`, `web/e2e/density-toggle.spec.ts`

**Critical flows (from spec §12):**

1. Login → add source → see first item summarized with translated title.
2. Density toggle persists across reload.
3. Open a non-native article → 要点 visible; body translation streams in; reload shows cached translation.
4. Highlight text → reload → highlight still rendered.
5. Prev/next from reader moves to next article AND marks current read in DB.
6. OPML import → sources appear; export roundtrips.

**Implementation notes:**

- Seed test data via API calls in `beforeEach`.
- Mock GitHub OAuth in CI by running the server with `XREADER_MOCK_OAUTH=1` flag that accepts any state and returns a fixed fake user; real OAuth reserved for manual testing.
- Use the MockGitHubClient from Sprint 1 via the same env flag.

**Steps:**
- [ ] Step 1: Configure Playwright. Add to CI.
- [ ] Step 2: Write `add-source-and-read.spec.ts` first (most critical). Run — expect PASS against the full docker-compose stack.
- [ ] Step 3: Add remaining specs.
- [ ] Step 4: CI runs E2E green.
- [ ] Step 5: Commit `git commit -m "test(web): Playwright E2E for critical flows"`

### Task 8.4 — Production deploy artifacts + runbook

**Files:**
- Create: `docker-compose.prod.yml`, `ops/deploy.md`, `ops/restore.md`

**Implementation notes:**

- `docker-compose.prod.yml` overrides: Postgres volume to a safer bind-mount path, builds with target `release`, env file loaded from `/etc/xreader/.env`, resource limits.
- `ops/deploy.md`: step-by-step: clone → set env → `docker compose pull && docker compose up -d` → run migrations → `seed-admin`.
- `ops/restore.md`: DB backup/restore procedure (`pg_dump` nightly via cron container; restore steps).

**Steps:**
- [ ] Step 1: Write compose override and runbooks.
- [ ] Step 2: Dry-run deploy on a clean VM/homelab host.
- [ ] Step 3: Commit `git commit -m "ops: production deploy artifacts and runbook"`

---

## Self-review checklist

Run through this after executing each sprint, and once more before calling v1 done.

### Spec coverage

Map each in-scope spec item (§3.1) to a task above:

| Spec requirement | Task(s) |
|---|---|
| GitHub OAuth + allowlist | 1.1 – 1.4 |
| RSS / Atom adapter, manual source add, OPML | 2.2 – 2.4, 3.3, 3.4 |
| Cron fetch worker | 2.5 |
| AI pipeline (eager title + 要点) | 4.3 |
| AI pipeline (lazy body SSE) | 4.4 |
| OpenAI-compatible client, config-driven | 4.2 |
| Native language per user | 1.1 (schema), 5.1 + 7.1 (UI) |
| Feed comfortable mode (mockup 01) | 5.3, 5.4 |
| Feed compact mode (mockup 02) | 5.5 |
| Feed tabs (Today/Stream/Starred) | 3.2 (API), 5.3 (UI) |
| Reader alternating paragraphs (mockup 03) | 6.2 |
| 要点 callout | 6.1 |
| Sticky prev/next + next-up card + auto-mark-read | 6.3 |
| Highlights local + notes, rendered on both layers | 6.4 |
| Highlights listing | 6.5 |
| Keyboard shortcuts (desktop) | 8.2 |
| Responsive layout (tap-only mobile) | 8.1 |
| Multi-tab sync (BroadcastChannel) | 7.4 |
| Docker Compose deployment | 0.3, 8.4 |
| FTS search | 3.5 |

If after writing a task, any row here has no task assigned, **add a task before marking the sprint done**.

### Placeholder scan (on completion)

- grep the plan for "TBD", "TODO", "implement later" — fail if any remain inside a task body
- grep the spec for any new contradictions introduced during implementation
- confirm every "Key tests" block has real code, not just names

### Type consistency

- Every method/function referenced in Task N+M matches the signature defined in its owning task.
- DB column names referenced in later sprints match the migrations. (Example: `article_ai.body_translation_content` is used identically in 4.1, 4.4, 6.2.)

If any inconsistency surfaces during execution, fix inline and continue — do not re-architect.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-xreader-web-v1-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Required sub-skill: `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in the current session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Because the owner has flagged quota constraints and plans to hand execution to a different session/agent, option (1) is the natural fit: each fresh session starts cold from the spec + plan, picks the next unchecked task, implements it with `superpowers:test-driven-development`, and checks off its boxes before ending.

**Recommended starting command for the next session:**

```
cd /Users/jin/Wspace/homelab/xreader-web
# Read the plan, find the next unchecked task under "Sprint 0", invoke
# superpowers:subagent-driven-development to implement it.
```
