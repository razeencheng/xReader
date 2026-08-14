# Reader Image and Translation Integrity Implementation Plan

> **For Codex agent:** REQUIRED SUB-SKILL: Use codex:executing-plans to implement this plan task-by-task.

**Goal:** Preserve feed/podcast images and guarantee one-to-one, retryable body translations without a database migration.

**Architecture:** Keep `content_html` as the rendering contract. Strengthen the translation parser and cache validity, then enrich only feed entries that advertise dropped images or item artwork, reusing SSRF-safe bounded HTTP access and the readable-page extractor.

**Tech Stack:** Go 1.25, `gofeed`, `goquery`, `bluemonday`, PostgreSQL-backed SSE cache, Vitest/React reader tests.

---

### Task 1: Parse translation labels across line boundaries

**Files:**
- Modify: `server/internal/ai/lazy_job.go`
- Test: `server/internal/ai/lazy_job_test.go`

1. Add a failing test where `[0]`, `[1]`, and `[2]` appear on one line.
2. Add a failing test showing an incomplete numbered response is rejected rather than assigned partially.
3. Run the targeted tests and confirm the mapping failure.
4. Require exact labels and non-empty text; treat inline multi-label responses as ambiguous and retry them one paragraph at a time.
5. Re-run the targeted AI tests.

### Task 2: Retry empty cached translations

**Files:**
- Modify: `server/internal/article/sse_handler.go`
- Test: `server/internal/article/sse_test.go`

1. Add a failing unit test showing an empty cached translation remains missing.
2. Run it and confirm the current cache treats it as complete.
3. Exclude empty values from the valid cache, persist completed batches, mark failed retries, and emit an SSE error so the existing reconnect path can retry missing work.
4. Re-run targeted SSE tests.

### Task 3: Preserve podcast artwork

**Files:**
- Modify: `server/internal/source/rss_adapter.go`
- Test: `server/internal/source/rss_adapter_test.go`

1. Add failing RSS fixture tests containing item-level and channel-level `itunes:image` with no body image.
2. Confirm the artwork is dropped.
3. Prepend a sanitized `<figure><img>` only when the body has no image, preferring item artwork over channel artwork.
4. Confirm existing body images are not duplicated.

### Task 4: Recover explicitly dropped article images

**Files:**
- Modify: `server/internal/source/rss_adapter.go`
- Modify: `server/internal/article/original_fetcher.go`
- Test: `server/internal/source/rss_adapter_test.go`
- Test: `server/internal/article/original_fetcher_test.go`

1. Add a failing feed/page fixture with an `unsupported block: image` marker and relative original image URLs.
2. Confirm the adapter stores image-free RSS content.
3. Expose/reuse readable extraction, resolve normal and lazy image URLs against the final page URL, and selectively fetch only marked items within a feed-level time budget.
4. Verify non-HTML, oversized, unsafe, or failed page fetches fall back to RSS content.
5. Verify ordinary feed entries cause no page fetch.

### Task 5: Verification and one task commit

**Files:**
- Review all changed files and this plan.

1. Run `gofmt` on changed Go files.
2. Run targeted Go and frontend regression tests.
3. Run `go test -race ./...`, `go vet ./...`, `pnpm vitest run`, `pnpm lint`, and `pnpm build`.
4. Inspect `git diff --check`, `git diff`, and security boundaries.
5. Commit once with a conventional `fix(reader): ...` message, following the repository’s one-task-one-commit rule.
