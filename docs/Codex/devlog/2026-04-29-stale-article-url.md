# 2026-04-29 Stale Article URL Recovery

## Context

Refreshing `/?article=149&ctx=today` showed an empty reader while the console reported `article not found`.

## Findings

- Article `149` still existed, but its source had been soft-deleted.
- Article detail lookup rejects articles whose source is deleted.
- Article list and batch-read queries did not consistently filter out deleted sources, so the feed could expose articles that the detail endpoint would not open.
- The reader returned `null` on a 404 article query, which produced a blank pane.

## Changes

- Added deleted-source filtering to article list/search/starred/unread/source queries and batch read queries.
- Regenerated sqlc output.
- Added backend tests for deleted-source exclusion in Today, enriched Today, search, and batch read.
- Added reader 404 handling so stale article URLs switch to another visible article or close the reader.
- Added frontend tests for missing article recovery, including stale cached list entries.

## Verification

- `go test ./internal/article -run 'TestListToday|TestListTodayEnrichedExcludesDeletedSources|TestBatchMarkRead_Today|TestSearch' -count=1`
- `go test ./internal/article -count=1`
- `go test ./... -count=1`
- `go build ./...`
- `pnpm vitest run src/app/'(app)'/page.test.tsx src/components/reader/ArticleReader.test.tsx`
- `pnpm vitest run`
- `pnpm exec eslint src/app/'(app)'/page.tsx src/app/'(app)'/page.test.tsx src/components/reader/ArticleReader.tsx src/components/reader/ArticleReader.test.tsx src/components/reader/ArticleView.tsx`
- `pnpm build`

## Notes

- Full `pnpm lint` still fails on pre-existing `no-explicit-any` issues in `src/lib/api-client.test.ts`, `src/stores/useUIStore.test.ts`, and `src/test-setup.ts`.
