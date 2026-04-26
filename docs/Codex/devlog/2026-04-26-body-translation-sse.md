# Body Translation SSE Alignment

**Date:** 2026-04-26
**Scope:** Reader body translation flow

## Summary

- Replaced manual per-paragraph translation controls with automatic SSE-driven rendering in `BilingualBody`.
- The reader opens `GET /api/articles/:id/body-translation` when a non-native-language article is rendered.
- Original paragraphs render immediately; translated paragraphs appear below their originals as SSE paragraph events arrive.
- Native-language articles render only the original body and do not open an SSE stream.
- Removed the obsolete frontend `useLazyTranslation` hook and undocumented backend `POST /articles/:id/body-translation` batch route.

## Verification

- `cd web && pnpm vitest run` passed: 29 files, 83 tests.
- `cd web && pnpm exec eslint src/components/reader/BilingualBody.tsx src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm build` passed.
- `cd server && go test ./...` passed.
- `cd web && pnpm lint` still fails on pre-existing lint issues in `src/lib/api-client.test.ts`, `src/stores/useUIStore.test.ts`, and `src/test-setup.ts`.
