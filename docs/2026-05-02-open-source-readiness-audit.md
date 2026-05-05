# xReader Open Source Readiness Audit

Date: 2026-05-02

Scope: backend, frontend, documentation, deployment, repository hygiene, security, dependencies.

Method: one coordinating audit plus four read-only parallel agents:

- Backend: Go API, database queries, workers, tests, API behavior.
- Frontend: Next.js app, UI behavior, accessibility, build and tests.
- Documentation: README, ops docs, open-source packaging, repo hygiene.
- Security: secrets, auth/session, SSRF, CSRF, headers, supply chain.

No source files were modified during the audit. This file records the combined and deduplicated report.

## Executive Summary

Do not publish the repository as open source yet.

The project has a coherent architecture and many good engineering decisions, but the current tree is not release-ready. The main blockers are failing test suites, a broken Docker publishing path, security hardening gaps around feed fetching and secrets, and documentation that still describes an older multi-service architecture.

The recommended gate for open-sourcing is:

1. Make backend and frontend tests green.
2. Fix the Docker build/runtime path.
3. Harden RSS fetching, session secrets, state ownership, cookies, CSRF, and security headers.
4. Update deployment and contributor-facing docs to match the current single-binary open-source architecture.
5. Clean local/private artifacts from the publishable tree.

## Release Blockers

### P0: Backend Tests Fail

`go test ./...` and `go test ./... -race -count=1` both fail in:

- `server/internal/source/service_test.go:236`

The test `TestSourceService_RefreshRunsEagerAIForInsertedArticles` expects two AI calls, while the implementation appears to have combined title translation and summary generation into one call.

Fix direction:

- Decide whether the combined AI call is the intended behavior.
- If yes, update the test fixtures and assertions to match the new one-call pipeline.
- If no, restore the separate title/summary calls.
- Re-run both normal and race backend tests before release.

### P0: Frontend Tests Fail

`pnpm vitest run` fails 8 tests across 4 files:

- `web/src/components/reader/TweaksPanel.test.tsx`
- `web/src/components/feed/FeedList.test.tsx`
- `web/src/components/sources/SourcesPage.test.tsx`
- `web/src/components/settings/SettingsPage.test.tsx`

Observed causes include stale component expectations, changed empty-state copy, changed source discovery behavior, `ApiError` missing from a test mock, and read-only versus disabled settings fields.

Fix direction:

- Separate stale tests from real regressions.
- Update tests only when behavior is intentionally changed.
- Keep or restore behavioral tests for feed dismissal, source discovery, and non-admin settings access.

### P0: Docker Release Path Is Broken

The frontend config uses static export:

- `web/next.config.ts:16`

But the Dockerfile expects standalone output:

- `web/Dockerfile:14`

`pnpm build` produces `out/`, not `.next/standalone/server.js`. A release image built from the current assumptions will not run correctly.

Fix direction:

- If the open-source design is static frontend served by Go, remove the standalone Docker path and copy `web/out`.
- If standalone Next runtime is intended, remove `output: "export"` and adjust the single-binary deployment plan.
- Add a CI job that actually builds the release image.

## High Priority Security and Correctness Findings

### P1: RSS Discovery and Feed Fetching Lack SSRF Protection

Risk locations:

- `server/internal/source/discovery.go:39`
- `server/internal/source/discovery.go:93`
- `server/internal/source/rss_adapter.go:22`
- `server/internal/source/rss_adapter.go:49`

The source discovery and RSS adapter use default HTTP/gofeed fetching with only basic URL scheme/host validation. An authenticated user can potentially make the server fetch private, loopback, link-local, or otherwise internal network addresses.

The project already has stronger SSRF protection for original article fetch and image proxy paths. That pattern should be extracted and reused for source discovery, feed validation, and worker fetches.

Fix direction:

- Reject localhost, loopback, private, link-local, multicast, and unspecified IP ranges.
- Revalidate redirects.
- Disable or tightly control proxy behavior.
- Limit response size and content type.
- Add tests for direct IP, DNS names resolving to private IPs, redirects, and IPv6 cases.

### P1: Weak Session and Encryption Secret Defaults

Risk locations:

- `server/cmd/xreader/main.go:38`
- `server/internal/crypto/secrets.go:25`
- `docker-compose.yml:8`

The server falls back to fixed values such as `change-me`, and secret encryption has a hardcoded fallback. This makes it too easy for open-source users to deploy an insecure instance.

Fix direction:

- Refuse startup outside explicit test/dev mode when `SESSION_SECRET` is missing, too short, or known placeholder text.
- Remove weak defaults from Docker Compose.
- Document a generation command for a strong secret.
- Ensure DB-stored AI/GitHub secrets are not encrypted with a public fallback.

### P1: Article State Writes Lack Ownership Checks

Risk locations:

- `server/internal/article/service.go:193`
- `server/internal/article/service.go:216`
- `server/db/queries/states.sql:1`
- `server/internal/fever/handler.go:372`

Single-article read/star/progress writes upsert state for the supplied article ID without proving that the article belongs to the current user. Fever item marking has the same pattern. Batch paths appear more constrained, but the single-item paths should also enforce ownership.

Fix direction:

- Change state upserts to `INSERT ... SELECT ... JOIN sources WHERE sources.user_id = $user_id`.
- Return 404 or equivalent when no owned article matches.
- Add cross-user negative tests for read, star, progress, and Fever item mark.

### P1: Admin Allowlist Delete Route Is Broken

Risk location:

- `server/internal/platform/router.go:146`

The route is registered as `/admin/allowlist/:username`, but the handler reads `github_username`. Deleting an allowlist entry will pass an empty string and fail.

Fix direction:

- Use one param name consistently.
- Add a handler-level test for `DELETE /api/admin/allowlist/:username`.

### P1: Deployment Documentation Describes an Old Architecture

Risk locations:

- `ops/deploy.md:25`
- `ops/deploy.md:33`
- `ops/deploy.md:40`
- `ops/restore.md:57`
- `AGENTS.md:31`
- `AGENTS.md:80`
- `AGENTS.md:114`

Docs still reference Redis, `cmd/api`, `cmd/worker`, `config/ai.yaml`, `server/api/openapi.yaml`, `docker-compose.prod.yml`, and separate api/web/worker services. The current open-source direction appears to be a single Go binary plus Postgres, with settings managed through the app/setup flow.

Fix direction:

- Update ops docs to the current `xreader + postgres` deployment.
- Remove or clearly mark legacy v1 architecture sections.
- Update AGENTS/CLAUDE guidance so future agents do not implement against stale assumptions.

### P1: Deploy Compose Does Not Match Code or Release Workflow

Risk locations:

- `deploy/docker-compose.yml:3`
- `deploy/docker-compose.yml:12`
- `deploy/.env.example:10`
- `.github/workflows/release.yml:41`
- `server/internal/platform/router.go:47`

The deploy compose uses a Docker Hub-style image name while the release workflow pushes GHCR. It also uses `GITHUB_OAUTH_CALLBACK`, while the code reads `GITHUB_CALLBACK_URL`.

Fix direction:

- Standardize the published image name.
- Use `GITHUB_CALLBACK_URL` consistently.
- Decide whether `deploy/` should be tracked for release.

## Medium Priority Findings

### P2: Cookie, CSRF, and Security Headers Need Hardening

Risk locations:

- `server/internal/auth/handler.go:17`
- `server/internal/auth/handler.go:57`
- `server/internal/middleware/csrf.go:16`
- `server/internal/platform/router.go:29`
- `server/internal/platform/static.go:40`
- `server/internal/article/sse_handler.go:194`
- `server/internal/article/sse_handler.go:221`

Issues:

- Session cookies are not explicitly `SameSite=Strict`.
- Secure cookie behavior depends on `COOKIE_SECURE` or direct TLS detection, which may not work behind a reverse proxy.
- CSRF middleware skips GET, but body translation SSE is a GET endpoint that can write state and trigger AI usage.
- CSP and common security headers are missing.

Fix direction:

- Make session cookies `SameSite=Strict`.
- Default secure cookies for production, and document reverse-proxy setup.
- Keep GET endpoints read-only; use POST to create translation jobs before SSE streaming, or enforce a CSRF token for SSE.
- Add CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, `Permissions-Policy`, and HSTS where appropriate.

### P2: Reader and Frontend Behavior Drift from Spec

Risk locations:

- `web/src/app/(app)/page.tsx:40`
- `web/src/components/reader/ArticleView.tsx:30`
- `web/src/hooks/useReaderShortcuts.ts:37`
- `web/src/hooks/useReaderGestures.ts:124`
- `web/src/app/(app)/sources/page.tsx:529`

Issues:

- Spec/E2E expect `/read/:id`; current app uses `/?article=`.
- Reader prev/next props are passed but not rendered.
- Shortcut behavior does not match the documented keys and read-state semantics.
- Mobile swipe navigation exists despite the newer spec saying it should be dropped to protect text selection.
- Source add flow fabricates `https://host/feed.xml` on the client rather than submitting raw input to backend discovery.

Fix direction:

- Decide which spec is current, then align routes, keyboard behavior, reader chrome, and tests.
- Prefer backend-driven source discovery with clear UI progress states.

### P2: Feed and Settings UI Have Accessibility/Test Gaps

Risk locations:

- `web/src/components/feed/FeedRowComfortable.tsx:39`
- `web/src/components/feed/FeedRowCompact.tsx`
- `web/src/app/(app)/settings/page.tsx:130`
- `web/src/app/layout.tsx:54`

Issues:

- Feed rows use `role="button"` containers with nested action buttons.
- Non-admin settings fields use `readOnly`, while tests expect disabled behavior.
- Root `<html lang>` is fixed to `zh-CN` while the app supports multiple native languages.

Fix direction:

- Avoid nested interactive semantics by splitting row open action and inline buttons into separate controls.
- Decide whether non-admin settings should be `disabled` or `readOnly`; align tests and accessibility.
- Sync document language from user preference where feasible.

### P2: Backend Edge-Case Correctness

Risk locations:

- `server/internal/highlight/service.go:133`
- `server/db/queries/articles.sql:70`
- `server/internal/article/sse_handler.go:221`

Issues:

- Translation-layer highlight validation indexes a translated paragraph slice by paragraph index; sparse lazy caches can fail incorrectly.
- Article stream pagination uses only `published_at < cursor`, which can skip articles sharing the same timestamp.
- SSE translation errors can still lead to a `done` event, while status remains `processing`.

Fix direction:

- Map translated paragraphs by `Index`.
- Use a compound `(published_at, id)` cursor.
- Send error events and persist failed status on translation errors.

### P2: Repository Hygiene Needs Cleanup

Risk locations:

- `.gitignore:15`
- `.gitignore:16`
- tracked `audit/*.png`
- tracked `server/cmd/xreader/static/.gitkeep`
- deleted tracked `xReader.html`

Issues:

- `.gitignore` ignores `.github`, which hides future workflows/templates.
- `audit/` is ignored but still has tracked screenshots.
- Internal audit screenshots and prototype files should not be part of the public repo unless intentionally curated.
- The working tree is dirty and `main` is ahead of origin by 41 commits.

Fix direction:

- Remove `.github` from `.gitignore`.
- Decide whether internal audit assets belong in the public repo.
- Move release screenshots to a curated `docs/screenshots/` path and reference them from README.
- Publish from Git tracked files, not a raw workspace archive.

## Lower Priority Findings

### P3: Open-Source Governance Docs Are Incomplete

Risk locations:

- `CONTRIBUTING.md:41`
- `CONTRIBUTING.md:55`
- missing `CODE_OF_CONDUCT.md`
- missing `SECURITY.md`

Fix direction:

- Add a security disclosure policy.
- Add or explicitly opt out of a code of conduct.
- Document expected issue/PR process for external contributors.

### P3: Template and Stale Docs Remain

Risk locations:

- `web/README.md:1`
- `README.md`
- `AGENTS.md`
- `ops/deploy.md`
- `ops/restore.md`

Issues:

- `web/README.md` is still the create-next-app template.
- README has some stale wording around reader layout and settings paths.
- Root agent docs still describe older commands and architecture.

Fix direction:

- Replace `web/README.md` with project-specific frontend notes or remove it.
- Make root README the authoritative open-source entry point.
- Keep internal agent docs consistent with current architecture.

### P3: Dependency and Metadata Polish

Findings:

- `pnpm audit --prod` reports one moderate `postcss <8.5.10` advisory through Next.
- `pnpm build` warns that `metadataBase` is missing, so social images resolve against `http://localhost:3000`.
- `govulncheck` found no Go vulnerabilities.

Fix direction:

- Upgrade affected Next/PostCSS lockfile entries when available.
- Add `metadataBase` for production builds.
- Keep `govulncheck` in CI if possible.

## Commands Run

Backend:

- `go test ./...` failed.
- `go test ./... -race -count=1` failed.
- `go vet ./...` passed.
- `go build ./...` passed.
- `sqlc compile -f db/sqlc.yaml` passed.
- `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` passed with no vulnerabilities.

Frontend:

- `pnpm lint` passed with warnings.
- `pnpm build` passed, but warned about missing `metadataBase`.
- `pnpm vitest run` failed 8 tests.
- `pnpm audit --prod` reported one moderate advisory.
- Frontend agent also ran Playwright: 1 passed, 3 failed, 4 skipped due to missing `playwright/.auth/user.json`.

Repository and docs:

- `git status --short --branch`
- `git diff --stat`
- `git ls-files`
- `git check-ignore`
- `rg`
- `find`
- `du`

## Current Worktree State Observed

At audit time:

- Branch: `main...origin/main [ahead 41]`
- Worktree: dirty before the audit started.
- Modified files include `.gitignore`, `docker-compose.yml`, backend article/query files, and multiple frontend reader/feed files.
- Deleted tracked files include `server/cmd/xreader/static/.gitkeep` and `xReader.html`.
- Untracked files include `deploy/`, new open-source launch docs, favicon/manifest assets, and `verify-reader-improvements.png`.

This audit did not revert, stage, or commit any of those changes.

## Recommended Fix Order

### Phase 1: Make Release Technically Valid

- Fix backend failing test.
- Fix frontend failing tests.
- Fix Docker build/runtime mismatch.
- Add CI coverage for release image build.

### Phase 2: Close Security Gaps

- Implement shared safe HTTP fetcher for RSS discovery/fetch.
- Remove weak secret fallbacks and require strong deployment secrets.
- Add article ownership checks to single state writes and Fever item marks.
- Harden cookies, CSRF-sensitive translation flow, and security headers.
- Remove local `.env` before any workspace packaging and rotate keys if they were ever shared.

### Phase 3: Align Product and Specs

- Resolve current source of truth between older v1 design and newer open-source launch design.
- Align reader route, keyboard behavior, source discovery flow, and reader navigation.
- Update or delete stale tests after behavior decisions.

### Phase 4: Prepare Public Repository

- Rewrite ops docs for the current single-binary architecture.
- Fix deploy compose image/env names.
- Remove `.github` from `.gitignore`.
- Clean internal audit/prototype assets or move curated public screenshots to `docs/screenshots/`.
- Replace `web/README.md` template.
- Add `SECURITY.md` and code-of-conduct guidance.

## Positive Notes

- SQL access is centralized through sqlc.
- Go build and vet pass.
- Frontend production build passes.
- `govulncheck` reports no Go vulnerabilities.
- Existing original article fetch and image proxy code already contain useful SSRF-safe patterns that can be reused.
- The repo has a clear open-source launch direction in the 2026-04-30 spec; the main task is to make implementation, tests, and docs converge on it.
