# List Translation Alignment

**Date:** 2026-04-29
**Scope:** Reader list item body translation

## Summary

- Changed body translation paragraph splitting so `ul` and `ol` are containers and each `li` is its own translated unit.
- Updated the reader to render each list item as an aligned original/translation pair instead of placing one combined list translation after the whole list.
- Added list-item spacing and translation indentation so short lists keep a readable list rhythm.
- Existing cached translations for whole-list blocks are treated as stale because their original text no longer matches the new per-item paragraph indexes.

## Verification

- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx -t "list item translations"` failed before the fix, then passed.
- `cd server && go test ./internal/ai -run TestSplitParagraphs_SplitsListItems -count=1 -v` failed before the fix, then passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm exec eslint src/components/reader/BilingualBody.tsx src/components/reader/BilingualBody.test.tsx` passed.
- `cd server && go test ./internal/ai ./internal/article -count=1` passed.
- `cd web && pnpm vitest run` passed.
- `cd web && pnpm build` passed.
- `cd server && go build ./...` passed.
- `cd server && go test ./...` passed after rerunning a transient testcontainers startup failure.
- Rebuilt and restarted the local API binary on `:8080`; `GET /health` returned `{"status":"ok"}`.
