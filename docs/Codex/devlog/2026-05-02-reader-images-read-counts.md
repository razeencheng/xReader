# 2026-05-02 reader images and read counts

## Scope

- Fixed reader image layout instability on mobile by rendering every reader image inside a stable aspect-ratio frame.
- Added explicit failed-image state so broken images keep their reserved height instead of letting the browser fallback resize the article.
- Fixed read-filter data flow so article lists request server-side read filters and receive durable context counts.

## Root Cause

- Reader images were emitted as raw lazy-loaded `img` nodes. In the nested mobile reader scroller this caused repaint flicker, and failed loads fell back to browser broken-image layout.
- The feed read filter was applied to the current client page only. After OPML/import backfill, the first stream page could contain 50 read items while unread items existed deeper in the server result set, so the main list showed `未读 0` while source totals showed hundreds.
- The backend handled `filter=unread` before `source_id`, so source-scoped unread requests could leak unread articles from other sources.

## Changes

- `BilingualBody` now proxies images as before, uses eager loading in the reader, wraps images with `data-reader-image-frame`, and marks frames as `loaded` or `error` from captured image events.
- Reader CSS reserves image aspect ratio and displays a stable `图片无法加载` failure state.
- Article list SQL now supports read-state filtering for today, stream, and source contexts, plus durable `unread/all/read` counts.
- Feed queries pass the selected read filter to the API and render API counts when present.

## Verification

- `cd server && go test ./internal/article -count=1` passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm vitest run src/components/feed/FeedList.test.tsx -t "requests server-side unread filtering|renders read filters|FeedList renders items|keeps a just-read"` passed.
- `cd web && pnpm lint` completed with existing `ArticleView` unused-prop warnings only.
- `cd web && pnpm build` passed.
- `cd server && go test ./... -count=1` still fails in the existing `internal/source` eager-AI test because it expects two AI calls while the current pipeline makes one combined call.
