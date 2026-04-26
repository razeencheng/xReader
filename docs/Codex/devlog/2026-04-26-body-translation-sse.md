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

## Viewport-Driven Lazy Translation Update

**Date:** 2026-04-26
**Scope:** Reader body translation performance

### Summary

- Changed body translation from full-article streaming on open to viewport-driven range streaming.
- `BilingualBody` now observes rendered paragraph blocks and requests the current paragraph plus the next four paragraphs with `start/count` query params.
- The SSE endpoint now serves cached paragraphs for the requested range immediately, translates only missing paragraphs, and merges partial results back into `article_ai.body_translation_content`.
- Partial caches keep `body_translation_status = 'processing'`; the status becomes `done` only when every paragraph is cached.
- Updated the design spec and implementation plan to describe range SSE, partial cache semantics, and viewport-driven prefetch.

## Source Management UI Fixes

**Date:** 2026-04-26
**Scope:** Source browser and source management page

### Summary

- Fixed `/api/sources` list items to include `last_fetched_at`, `last_success_at`, `consecutive_fails`, and `health`, so the management page no longer renders successful sources as `错误 / 从未`.
- Implemented manual `POST /api/sources/:id/refresh` fetch logic instead of returning a placeholder queued response.
- Changed the source browser `/sources` action from `添加` to `管理` and switched the icon to match the management destination.
- Removed the article-list/source-browser crossfade that could keep the old feed filter UI mounted for one frame while entering the source view.
- Added refresh failure feedback on the source management page.

### Verification

- `cd server && go test ./internal/source -count=1` passed.
- `cd server && go test ./internal/source/... ./internal/sync/... ./internal/platform/... -count=1` passed.
- `cd web && pnpm vitest run src/components/sources/SourcesPage.test.tsx src/components/layout/SourceBrowser.test.tsx src/app/'(app)'/page.test.tsx src/lib/i18n.test.ts` passed.
- `cd web && pnpm build` passed.
- `docker compose up -d --build api web` succeeded.
- Browser verified `/sources` shows `健康` and `上次抓取：刚刚`; source browser action now shows `管理`.

## Reader HTML And Image Stability Fixes

**Date:** 2026-04-26
**Scope:** Reader article rendering

### Summary

- Fixed reader block classification so paragraphs with inline `<code>` stay in normal text flow; only `<pre>` blocks receive code-block styling.
- Removed feed/source heading anchor artifacts such as trailing `#` from reader rendering and future sanitized RSS content.
- Adjusted reader h3 styling back to a plain typographic heading instead of a left-accent callout style.
- Stabilized external images that do not provide width/height by adding a fallback aspect ratio and suppressing filename-like alt text during loading/failure.
- Updated the image proxy to accept servers that return valid WebP bytes with `Content-Type: application/octet-stream`, while still rejecting non-images and SVG.

### Verification

- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx` passed.
- `cd server && go test ./internal/article -run 'TestNormalizeProxiedImageContentType_AllowsSniffedWebPFromOctetStream|TestImageProxyHandler_ProxiesImage' -count=1` passed.
- `cd server && go test ./internal/source -run TestSanitizeHTML_StripsHiddenHeadingAnchors -count=1` passed.
- `cd web && pnpm build` passed.
- `docker compose up -d --build api web` succeeded.
- Browser verified article `16677`: `详细配置` no longer shows a trailing `#`, the inline-code paragraph renders as normal prose, and the formerly broken WebP image loads through the proxy without filename flicker.
