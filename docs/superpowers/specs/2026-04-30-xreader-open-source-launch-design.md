# xReader Open-Source Launch — Design Spec

- **Status**: Design complete, ready for implementation planning
- **Date**: 2026-04-30
- **Author**: razeen.cheng@outlook.com
- **Builds on**: `docs/superpowers/specs/2026-04-18-xreader-web-v1-design.md` (v1 feature spec)

---

## 1. Background & goal

xReader is a self-hosted RSS reader with AI-powered translation and key-point summaries. The v1 feature set is essentially complete (GitHub OAuth, RSS subscriptions, bilingual reader, highlights, keyboard shortcuts). The goal of this spec is to prepare xReader for its **first public open-source release** targeting homelab users and the self-hosted community.

Three gaps must be closed before launch:

1. **Deployment complexity** — currently 5 containers (Next.js + Go API + Go Worker + Postgres + Redis) with CLI-based admin seeding. Must be reduced to **2 containers** (single Go binary + Postgres) with a web-based Setup Wizard.
2. **Feature gaps** — no Fever API (blocks third-party client support) and no full-text search.
3. **Open-source infrastructure** — no README, LICENSE, CONTRIBUTING, CI/CD, or multi-arch Docker images.

### Core positioning

A **self-hosted RSS reader** competing with Miniflux, FreshRSS, and Tiny Tiny RSS. The differentiator is the **AI-powered reading experience**: automatic title translation, key-point summaries (要点), and paragraph-by-paragraph bilingual rendering — all backed by any OpenAI-compatible API.

### Target audience

- Chinese and international homelab / NAS enthusiasts (r/selfhosted, V2EX, NAS forums)
- Self-hosted software collectors who evaluate based on: ease of deployment, third-party client support, and feature differentiation
- Power RSS readers who follow multilingual sources

### License

AGPL-3.0 (consistent with Miniflux, FreshRSS).

---

## 2. Success criteria

The launch is ready when:

1. `docker compose up` with a 2-service compose file (xreader + postgres) starts the entire stack.
2. First-time users see a Setup Wizard in the browser — zero CLI interaction required.
3. Reeder or NetNewsWire can connect via Fever API, sync feeds/read/starred state.
4. Users can search articles by keyword across titles and body text.
5. README (bilingual), LICENSE, CONTRIBUTING, GitHub Actions CI/CD, and multi-arch Docker images are all in place.
6. Tagged release `v0.1.0` is published on GitHub with container images on GHCR.

---

## 3. Scope boundaries

### 3.1 In scope (this spec)

- Single Go binary architecture (merge api + worker, embed static frontend)
- Remove Redis dependency (Postgres-backed sessions + stateless HMAC CSRF)
- Next.js static export (`output: 'export'`) embedded via Go `embed`
- Setup Wizard (web-based first-run configuration)
- Fever API compatibility layer
- Full-text search (Postgres-based, bigram for CJK)
- Open-source files (README, LICENSE, CONTRIBUTING, issue templates)
- CI/CD (GitHub Actions: PR checks + release pipeline)
- Multi-architecture Docker images (linux/amd64 + linux/arm64)
- P0/P1 UI/UX fixes from the 2026-04-30 audit (Invalid Date bug, touch targets, safe-area)

### 3.2 Out of scope (deferred)

| Deferred | Phase | Notes |
|---|---|---|
| Local username/password auth | Post-launch | GitHub OAuth first; local auth adds complexity |
| Non-RSS adapters (X, HN, Reddit) | Post-launch | RSS covers most use cases via bridges |
| PWA / offline reading | Post-launch | Nice-to-have, not launch-blocking |
| Auto-cleanup policies | Post-launch | Configurable retention ("keep N days") |
| Health monitoring dashboard | Post-launch | Feed success rates, AI usage, DB size |
| Google Reader API | Post-launch | Fever covers more clients today |

---

## 4. Phase 1 — Architecture: single binary + 2 containers

### 4.1 Target architecture

```
xreader (single Go binary)
├── HTTP Server (Gin)
│   ├── /api/*         — REST API (existing)
│   ├── /fever/        — Fever API compat layer (Phase 2)
│   └── /*             — Static files (embedded Next.js export)
├── Worker (goroutine)
│   ├── RSS Fetch Cron  — periodic feed polling
│   └── AI Pipeline     — title translation, 要点, lazy body translation
└── Internal
    └── Session Store   — Postgres-backed (replaces Redis)
```

### 4.2 Merge api + worker

Currently `cmd/api/` and `cmd/worker/` are separate entry points. Merge into a single `cmd/xreader/`:

- `main()` starts the Gin HTTP server in one goroutine and the worker loop in another
- Graceful shutdown: context cancellation stops both
- The worker reuses the same database pool and service layer instances
- Remove `cmd/api/` and `cmd/worker/` directories; single entry point at `cmd/xreader/`
- Keep `cmd/backfill-ai/` as a standalone maintenance utility (not part of the main binary)

### 4.3 Remove Redis

| Current Redis usage | Replacement |
|---|---|
| Session storage (`auth/session.go`) | Postgres-only via existing `auth_sessions` table — `PgSessionStore` queries Postgres directly instead of Redis. Cookie holds session ID; session data is in Postgres. |
| CSRF state (`auth/state_store.go`) | Cookie-based CSRF token with HMAC validation (using `SESSION_SECRET`) — stateless, no server storage needed. State is bound to the browser via an HttpOnly cookie. |
| Cross-tab sync (BroadcastChannel) | Pure client-side — no Redis involvement, unchanged |
| Cross-device polling | REST API polling — no Redis involvement, unchanged |

Note: The worker process (`cmd/worker`) does NOT use Redis — it polls Postgres directly via `ListSourcesDueForFetch` and runs AI jobs inline. No job queue migration is needed; the existing in-process worker loop is sufficient for homelab scale.

Migration: No new tables needed for session removal — the existing `auth_sessions` table is already populated (sessions dual-write today). All `redis.Client` references in Go code are removed.

### 4.4 Next.js static export + Go embed

**Build pipeline:**

```
pnpm build                    # next.config: output: 'export'
                              # produces web/out/ with static HTML/JS/CSS
go build -o xreader ./cmd/xreader
                              # embeds web/out/ via //go:embed
```

**Go static file server:**

```go
//go:embed all:static
var staticFS embed.FS

// Serve static files, fallback to index.html for SPA routing
func staticHandler() http.Handler {
    fs := http.FS(staticFS)
    fileServer := http.FileServer(fs)
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // Try actual file first, fallback to index.html
        if _, err := staticFS.Open(path); err != nil {
            // SPA fallback
            r.URL.Path = "/index.html"
        }
        fileServer.ServeHTTP(w, r)
    })
}
```

**Next.js changes required:**

- `next.config.ts`: add `output: 'export'`
- Remove any API rewrites/proxies (frontend calls `/api/*` directly on same origin)
- Verify all pages work as client-side SPA (no `getServerSideProps`, no server actions)
- Image optimization: already using Go image proxy, no Next.js Image component dependency

**Development workflow (unchanged):**

- `cd web && pnpm dev` — Next.js dev server on :3000
- `cd server && go run ./cmd/xreader` — Go server on :8080
- Next.js dev server proxies `/api/*` to :8080 (dev only)

### 4.5 Setup Wizard

When the application starts and detects no admin user in the database, it serves a setup wizard instead of the normal app:

```
Step 1: GitHub OAuth Configuration
    - Client ID (required)
    - Client Secret (required)
    - Callback URL (auto-filled with current origin + /api/auth/callback)
    → Saved to database `settings` table (encrypted at rest)

Step 2: AI Service Configuration (optional, skippable)
    - OpenAI-compatible base URL
    - API Key
    - Model name
    → Skip disables translation/summary features until configured later

Step 3: Admin Account
    - GitHub username for the first admin
    → Creates the allowlist entry + admin role

→ Complete, redirect to GitHub login
```

The wizard is a set of static HTML pages embedded in the binary (part of the Next.js app), with API endpoints under `/api/setup/*` that are only accessible when no admin exists.

**Config precedence:** Environment variables (e.g. `GITHUB_CLIENT_ID`) take precedence over database `settings` values. This lets advanced users manage config via env vars / Docker secrets while casual users use the wizard.

### 4.6 Docker deployment

**docker-compose.yml:**

```yaml
services:
  xreader:
    image: ghcr.io/OWNER/xreader:latest
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://xreader:xreader@postgres:5432/xreader?sslmode=disable
      SESSION_SECRET: ${SESSION_SECRET:-change-me-to-a-random-string}
      # GitHub OAuth + AI configured via Setup Wizard, or set here:
      # GITHUB_CLIENT_ID: ...
      # GITHUB_CLIENT_SECRET: ...
      # XREADER_AI_API_KEY: ...
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

**Dockerfile (multi-stage):**

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build   # output: 'export' → produces out/

# Stage 2: Build Go binary
FROM golang:1.25-alpine AS backend
WORKDIR /app/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=frontend /app/web/out ./static/
RUN CGO_ENABLED=0 go build -o /xreader ./cmd/xreader

# Stage 3: Runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=backend /xreader /usr/local/bin/xreader
EXPOSE 3000
ENTRYPOINT ["xreader"]
```

---

## 5. Phase 2 — Feature completion

### 5.1 Fever API compatibility

**Purpose:** Enable third-party RSS clients (Reeder, NetNewsWire, Unread, ReadKit, Fiery Feeds) to connect to xReader.

**Authentication:**

Fever API uses `api_key = MD5(username:password)`. Since xReader uses GitHub OAuth (no password), users set a dedicated Fever password:

- Settings page: new "Third-party clients" section with a Fever password field
- Database: `users.fever_api_key CHAR(64)` stores `SHA-256(MD5(github_username:fever_password))` — the raw MD5 key is never persisted, only shown once to the user after generation
- Fever requests authenticate by hashing the submitted `api_key` with SHA-256 and comparing against the stored hash

**Endpoints (all POST to `/fever/`):**

| Parameter | Function | Data source |
|---|---|---|
| `?api` | Auth check | `users.fever_api_key` |
| `?feeds` | Feed list | `sources` table |
| `?groups` | Feed groups | Source categories or default single group |
| `?favicons` | Feed icons | `sources.icon_url` |
| `?items` | Article list (paginated) | `articles` table |
| `?unread_item_ids` | Unread article IDs | `article_states.is_read = false` |
| `?saved_item_ids` | Starred article IDs | `article_states.is_starred = true` |
| `mark=item&as=read/unread/saved/unsaved` | Mark single item | `article_states` update |
| `mark=group&as=read&before=TIMESTAMP` | Bulk mark read | `article_states` batch update |

**Database changes:**

- `ALTER TABLE users ADD COLUMN fever_api_key CHAR(64)` (SHA-256 hex digest)
- No new tables needed — all Fever data maps to existing tables

**Implementation:**

- New package `server/internal/fever/` with handler + service
- Reuses existing `article`, `source`, `user` service layers
- Register `POST /fever/` in the Gin router

### 5.2 Full-text search

**Approach:** Postgres-native FTS with bigram tokenization for CJK support. No external dependencies (no Elasticsearch, no plugins required).

**Database changes:**

```sql
ALTER TABLE articles ADD COLUMN fts_vector tsvector;
CREATE INDEX idx_articles_fts ON articles USING GIN(fts_vector);
```

**Indexing strategy:**

- Index `title` + `content_text` + AI-translated title (if exists)
- For CJK text: use bigram (2-character sliding window) tokenization via a custom Postgres function — no `pg_jieba` or `zhparser` plugin required
- For Latin text: use built-in `english` text search configuration
- Trigger on INSERT/UPDATE to auto-maintain `fts_vector`

**Search API:**

```
GET /api/articles?q=keyword&tab=today|stream|starred&source_id=N
```

- Extends existing article list API with `q` parameter
- Results ranked by relevance (`ts_rank`)
- Highlights matching terms in response (`ts_headline`)

**Frontend:**

- Search bar in feed list header (activated by `/` keyboard shortcut — already wired)
- Results render in the same FeedList component
- Search clears when switching tabs or pressing Escape

### 5.3 UI/UX P0/P1 fixes

From the 2026-04-30 audit report (`audit/2026-04-30-ui-ux-audit-v1.md`):

| ID | Fix | Effort |
|---|---|---|
| C3 | Admin page "Invalid Date" bug | Small |
| C1 | Feed row button touch targets (44px min) | Medium |
| C2 | Highlight toolbar touch targets | Medium |
| I1/I2 | Safe-area inset for fixed-position elements | Medium |
| M1 | Dark mode hardcoded colors (6 locations) | Small |
| M3 | Undefined `hide-mobile` CSS class | Small |

---

## 6. Phase 3 — Open-source release

### 6.1 Project files

| File | Content |
|---|---|
| `README.md` | Bilingual (EN/CN). Sections: hero screenshot, features, quick start, configuration, Fever API, screenshots, roadmap, contributing, license |
| `LICENSE` | AGPL-3.0 full text |
| `CONTRIBUTING.md` | Dev environment setup, PR conventions (conventional commits), testing requirements, code of conduct reference |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Structured bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature request template |

### 6.2 CI/CD (GitHub Actions)

**`ci.yml` — runs on every PR:**

```yaml
jobs:
  backend:
    - go vet ./...
    - go test ./... -race (with testcontainers/Postgres)
  frontend:
    - pnpm lint
    - pnpm vitest run
  build:
    - pnpm build (verify static export)
    - go build (verify binary compiles with embedded static)
```

**`release.yml` — triggered by `v*` tag:**

```yaml
jobs:
  release:
    - Build multi-arch Docker image (linux/amd64, linux/arm64)
    - Push to ghcr.io/OWNER/xreader:TAG and :latest
    - Create GitHub Release with auto-generated changelog
```

ARM64 support is essential — Synology, Raspberry Pi, and many NAS devices run ARM.

### 6.3 Release checklist for v0.1.0

- [ ] All tests passing (Go + Vitest)
- [ ] 2-container deployment verified end-to-end
- [ ] Setup Wizard flow tested (fresh database)
- [ ] Fever API tested with Reeder and/or NetNewsWire
- [ ] Search tested with CJK and Latin queries
- [ ] README with screenshots
- [ ] Docker images built for amd64 + arm64
- [ ] Tagged `v0.1.0` on GitHub

### 6.4 Post-launch roadmap (documented in README)

| Priority | Feature | Description |
|---|---|---|
| Near-term | Local auth | Username/password login (no GitHub required) |
| Near-term | Auto-cleanup | Configurable retention policies |
| Near-term | PWA | Add-to-homescreen, offline shell |
| Mid-term | Health dashboard | Feed status, AI usage, storage metrics |
| Mid-term | More adapters | HackerNews, Reddit, Newsletter (email-to-RSS) |
| Long-term | Google Reader API | Additional client compatibility |

---

## 7. Implementation order

```
Phase 1: Architecture (est. ~2 weeks)
├── 1.1 Merge cmd/api + cmd/worker → cmd/xreader (single process)
├── 1.2 Replace Redis sessions → Postgres-backed sessions
├── 1.3 Replace Redis CSRF state → stateless HMAC cookie
├── 1.4 Remove Redis from docker-compose and all Go imports
├── 1.5 Next.js output: 'export' + verify all pages work as SPA
├── 1.6 Go embed static files + SPA fallback handler
├── 1.7 Unified Dockerfile (multi-stage) + new docker-compose.yml
├── 1.8 Setup Wizard (API + frontend pages)
└── 1.9 End-to-end verification: fresh deploy with 2 containers

Phase 2: Features (est. ~1-2 weeks)
├── 2.1 Fever API: auth (fever_api_key) + all endpoints
├── 2.2 Fever API: test with Reeder / NetNewsWire
├── 2.3 Full-text search: migration + bigram indexing + API
├── 2.4 Full-text search: frontend search bar
├── 2.5 UI/UX P0/P1 fixes from audit
└── 2.6 End-to-end verification

Phase 3: Open-source release (est. ~1 week)
├── 3.1 README.md (bilingual + screenshots)
├── 3.2 LICENSE + CONTRIBUTING.md + issue templates
├── 3.3 GitHub Actions CI/CD
├── 3.4 Multi-arch Docker image build + GHCR push
├── 3.5 Tag v0.1.0 + GitHub Release
└── 3.6 Community launch (r/selfhosted, V2EX, NAS forums)
```

---

## 8. Key decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Deployment target | 2 containers (Go binary + Postgres) | Match Miniflux simplicity; first impression matters for adoption |
| Redis removal | Postgres-backed sessions (existing `auth_sessions` table) + stateless HMAC CSRF | Eliminate dependency; worker already polls Postgres directly, no queue migration needed |
| Frontend embedding | Next.js static export + Go embed | Single binary; no SSR needed (auth-gated app, no SEO requirement) |
| Third-party client API | Fever (not Google Reader) | Broader client support; simpler to implement |
| CJK search | Postgres bigram (no plugins) | Zero additional deployment dependencies |
| License | AGPL-3.0 | Community standard for self-hosted RSS readers |
| Target audience | Bilingual (EN + CN) | Maximize reach across self-hosted communities |
| First-run UX | Web-based Setup Wizard | Zero CLI interaction; lower barrier to entry |
