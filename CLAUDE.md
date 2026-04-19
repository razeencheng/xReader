# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI agents when working with code in this repository.

## Project overview

xReader Web is a design-first information aggregation platform with a Go backend and Next.js frontend in a monorepo structure. It features GitHub OAuth authentication (allowlist-based), RSS feed aggregation with AI-powered title translation and summary (要点), and an immersive bilingual reader.

**This is a fresh rewrite** — the predecessor at `../xreader/` is legacy. Do not copy its frontend code. Selectively reuse backend patterns only when they match the spec.

## Authoritative documents (read these first, every session)

| Document | Path | Purpose |
|---|---|---|
| Design spec | `docs/superpowers/specs/2026-04-18-xreader-web-v1-design.md` | Single source of truth for requirements, architecture, data model, API contract, visual tokens |
| Implementation plan | `docs/superpowers/plans/2026-04-18-xreader-web-v1-plan.md` | Sprint-by-sprint task breakdown with TDD steps, key tests, commit messages |
| Feed comfortable mockup | `docs/superpowers/specs/mockups/01-feed-comfortable.html` | Pixel-authoritative UI target |
| Feed compact mockup | `docs/superpowers/specs/mockups/02-feed-compact.html` | Pixel-authoritative UI target |
| Reader mockup | `docs/superpowers/specs/mockups/03-reader.html` | Pixel-authoritative UI target |
| AI dev guidelines | `docs/ai-development-guidelines.md` | Principles and anti-patterns for AI-assisted development |

## Commands

### Backend (Go)

```bash
cd server && go test ./...                     # All tests (requires Docker for testcontainers)
cd server && go test ./... -race               # Tests with race detection
cd server && go test ./internal/source/... -run TestNormalize -v -count=1  # Single test
cd server && go build ./...                    # Build all
cd server && go run ./cmd/api                  # Run API server on :8080
cd server && go run ./cmd/worker               # Run RSS fetch + AI worker
cd server && go vet ./...                      # Lint
```

### Frontend (Next.js)

```bash
cd web && pnpm install                         # Install dependencies
cd web && pnpm dev                             # Dev server (Turbopack) on :3000
cd web && pnpm vitest run                      # Unit tests
cd web && pnpm vitest run src/lib/api-client.test.ts  # Single test
cd web && pnpm build                           # Production build
cd web && pnpm lint                            # ESLint + TypeScript check
cd web && pnpm exec playwright test            # E2E tests
```

### Infrastructure

```bash
make up                                        # Start Postgres 16 + Redis 7
make down                                      # Stop services
make migrate-up                                # Run all migrations
make migrate-down                              # Rollback one migration
make sqlc-generate                             # Regenerate Go code from SQL queries
make test                                      # Run all backend + frontend tests
make lint                                      # Lint all
make seed-admin GH_USER=razeencheng            # Bootstrap the first admin
```

## Architecture

### Backend (`server/`)

- **`cmd/api/`** — API server entry point (Gin router)
- **`cmd/worker/`** — Standalone RSS fetch + AI pipeline worker
- **`internal/`** — Domain packages, each with service + handler + tests:
  - `auth/` — GitHub OAuth, Redis sessions, CSRF state
  - `source/` — Source adapter interface, RSS adapter, URL normalization, OPML
  - `article/` — Article listing, state, FTS search, SSE for lazy body translation
  - `ai/` — OpenAI-compatible client, config loader, eager/lazy pipeline jobs, prompts
  - `highlight/` — Highlight CRUD with offset-based anchoring
  - `user/` — Profile settings (native language, density, theme)
  - `admin/` — Allowlist management
  - `sync/` — Fetch worker, cross-device polling changes endpoint
  - `middleware/` — Auth + admin guard
  - `platform/` — Router, health/ready
  - `testutil/` — `SetupTestDB()` via testcontainers-go (real Postgres per test)
- **`db/`** — Migrations (`migrations/`), sqlc queries (`queries/`), generated code (`gen/`)
- **`api/openapi.yaml`** — OpenAPI 3.1 spec (contract source of truth)

### Frontend (`web/`)

- **Next.js 15** App Router + TypeScript + Tailwind CSS 4
- **State:** Zustand (client: auth, UI prefs) + TanStack React Query (server data)
- **API client:** `src/lib/api-client.ts` — typed fetch with credentials, auto-401 redirect
- **Path alias:** `@/` maps to `src/`
- **Testing:** Vitest + Testing Library + MSW (unit), Playwright (E2E)

### AI pipeline

- **OpenAI-compatible**: all AI calls go through a single `AIClient` that POSTs to a configurable base URL. Config lives in `config/ai.yaml`; API key read from env var.
- **Eager (on fetch):** title translation + 要点 summary for every new article
- **Lazy (on read):** body translation streams paragraph-by-paragraph via SSE

## Key patterns

- **Backend tests require Docker** — `testutil.SetupTestDB()` uses testcontainers-go. No database mocking.
- **sqlc is the database access layer** — write SQL in `server/db/queries/*.sql`, then `make sqlc-generate`. Never hand-write Go query code in `db/gen/`.
- **TDD workflow** — Red → Green → Refactor. Backend coverage ≥ 80% (service ≥ 90%). Frontend ≥ 70%.
- **Mockups are pixel-authoritative** — don't redesign; if something feels wrong, flag it to the owner.
- **One task = one commit** — follow conventional commits (`feat(scope): ...`).

## Safety gates (always ask the owner before)

- Adding new database migrations (`server/db/migrations/`)
- Modifying `server/api/openapi.yaml`
- Adding new Go or npm dependencies
- Destructive git operations (`push --force`, `reset --hard`, `commit --amend` on pushed commits)
- Implementing anything not in the spec §3.1 (in-scope list)

## Environment

Copy `.env.example` to `.env`. Required vars: `DATABASE_URL`, `REDIS_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `XREADER_AI_CONFIG`, `XREADER_AI_API_KEY`. See `.env.example` for defaults.

AI config: `config/ai.yaml` (model names + base URL). API key is in the env var, not in the YAML.

## Dev-loop workflow

Each task follows this cycle:

```
1. READ   — Check plan, find next unchecked task
2. TEST   — Write the failing test first
3. IMPL   — Write minimal code to pass
4. BUILD  — make build / pnpm build
5. TEST   — make test / pnpm vitest run
6. VERIFY — Start locally, check via browser if UI
7. LOG    — Write round log to docs/claude/devlog/
8. COMMIT — One task, one commit
```

After every 5 rounds, write a compaction summary to `docs/claude/devlog/YYYY-MM-DD-summary.md`.

## What NOT to do

- Don't start multiple tasks at once. Finish one, log it, commit, then start the next.
- Don't refactor code unrelated to the current task.
- Don't add features not in the spec.
- Don't ignore test failures — they are the signal.
- Don't "improve" mockup designs without explicit owner approval.
- Don't hardcode AI provider endpoints or model names — they're config-driven.
- Don't weaken test assertions to make them pass.
