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

## Reader Original Link And AI Settings

**Date:** 2026-04-26
**Scope:** Reader chrome and model integration settings

### Summary

- Removed the decorative left rule from streamed translation paragraphs so translated text follows the source paragraph rhythm without an extra callout style.
- Added a reader header action `阅读原文` that opens the article canonical link in a new browser tab.
- Added `模型接入设置` on the Settings page for OpenAI-compatible endpoint, API key, and model name.
- Added Redis-backed AI settings overrides so the API and worker can resolve the latest model integration settings without database migrations and without writing API keys into tracked config files.
- Updated the design spec to document file/env defaults plus runtime admin overrides.

### Verification

- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx src/components/reader/ReaderHeader.test.tsx src/components/settings/SettingsPage.test.tsx` passed.
- `cd server && go test ./internal/ai -run 'TestSettingsService|TestLoadConfig' -count=1` passed.
- `cd server && go test ./internal/ai ./internal/article -run 'TestSettingsService|TestLoadConfig|TestSSE_StreamsRequestedRangeOnly' -count=1` passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx src/components/reader/ReaderHeader.test.tsx src/components/settings/SettingsPage.test.tsx src/lib/i18n.test.ts` passed.
- `cd web && pnpm build` passed.
- `docker compose up -d --build api web` succeeded.
- Browser verified `/settings` shows `模型接入设置` with endpoint `https://newapi.razeen.cn/v1` and model `qwen-turbo`; article `16799` shows the `阅读原文` header action and streamed translation layers no longer include `border-l` classes.

## Reader Highlight And Notes Polish

**Date:** 2026-04-26
**Scope:** Reader original link placement, highlights, and notes

### Summary

- Moved `阅读原文` out of the sticky reader chrome and into the article metadata row as an inline text action, so the byline reads like `16d 前 · 26 分钟阅读 · 阅读原文`.
- Fixed highlight rendering to anchor by `layer + paragraph_index` instead of paragraph index alone, so translation-layer highlights no longer render on the original paragraph with the same index.
- Scoped highlight DOM cleanup to the current reader instance and assigned `id="highlight-<id>"` to marks so saved-highlight links can scroll back into the original article.
- Replaced native `prompt()` note editing with an inline reader dialog for both existing highlights and new `高亮并添加备注` actions.
- Added a visible `我的高亮` navigation entry and fixed `/highlights` to read the backend `{ items }` response envelope without getting stuck in loading state.

### Verification

- `cd web && pnpm vitest run src/components/highlights/HighlightsList.test.tsx src/components/reader/HighlightLayer.test.tsx src/components/reader/HighlightToolbar.test.tsx src/lib/queries/highlights.test.ts src/components/reader/OriginalArticleButton.test.tsx src/components/reader/ReaderHeader.test.tsx src/components/layout/Sidebar.test.tsx src/components/layout/ResponsiveAppNav.test.tsx src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm vitest run` passed: 35 files, 104 tests.
- `cd web && pnpm exec eslint <changed files>` passed.
- `cd web && pnpm build` passed.
- `docker compose up -d --build web` succeeded.
- Browser verified article `16799` shows `阅读原文` inline in the title metadata area and `/highlights` opens from the top navigation, lists saved highlights, and links back to `/read/<id>#highlight-<id>`.

## Database Backed AI Provider Settings

**Date:** 2026-04-26
**Scope:** Model integration settings persistence and access control

### Summary

- Replaced Redis-backed AI provider overrides with a Postgres `ai_provider_settings` table.
- Encrypted API Key storage at rest with AES-GCM and persisted only a masked key hint for Settings-page display.
- Removed the AI YAML/env runtime path from API, worker, docker compose, and `.env.example`; the Settings page is now the canonical configuration surface.
- Restricted `PATCH /api/ai/settings` to admin users while keeping masked settings readable by authenticated users.
- Updated the design spec and implementation plan to document database-backed provider settings instead of file/env AI configuration.

### Verification

- `cd server && go test ./internal/ai -run 'TestSettings|TestPostgresSettings|TestLoadConfig' -count=1` passed.
- `cd server && go test ./...` passed.
- `cd web && pnpm vitest run` passed: 35 files, 106 tests.
- `cd server && go build ./...` passed.
- `cd web && pnpm build` passed.
- `cd server && go vet ./...` passed.
- `cd web && pnpm exec eslint src/app/'(app)'/settings/page.tsx src/components/settings/SettingsPage.test.tsx src/lib/i18n.ts` passed.
- `DATABASE_URL='postgres://xreader:xreader@localhost:5432/xreader?sslmode=disable' make migrate-up` applied migration `007_ai_provider_settings`.
- `docker compose up -d --build api worker web` succeeded.
- Browser verified `/settings` shows the database-backed model integration section, no configured API Key, and the non-admin read-only notice.
