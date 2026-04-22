# Mock API Browser Testing Report

**Date:** 2026-04-19
**Scope:** Frontend-only browser testing with mock API route handlers (no Go backend)

## Test Environment

- Next.js 15 dev server (Turbopack) on localhost:3000
- Mock API route handlers under `web/src/app/api/`
- Chrome DevTools MCP for automated browser interaction
- Viewport configurations: desktop (default) + mobile (375x812, 3x DPR, touch)
- Color schemes: light + dark (via `prefers-color-scheme` emulation)

## Mock API Coverage

20 endpoints implemented as Next.js App Router route handlers:

| # | Endpoint | Methods |
|---|----------|---------|
| 1 | `/api/auth/me` | GET |
| 2 | `/api/auth/logout` | POST |
| 3 | `/api/articles` | GET (cursor pagination) |
| 4 | `/api/articles/[id]` | GET |
| 5 | `/api/articles/[id]/ai` | GET |
| 6 | `/api/articles/[id]/state` | PATCH, PUT |
| 7 | `/api/articles/[id]/highlights` | GET |
| 8 | `/api/articles/changes` | GET |
| 9 | `/api/highlights` | GET, POST |
| 10 | `/api/highlights/[id]` | PUT, DELETE |
| 11 | `/api/sources` | GET, POST |
| 12 | `/api/sources/[id]` | PUT, DELETE |
| 13 | `/api/sources/[id]/refresh` | POST |
| 14 | `/api/sources/import` | POST |
| 15 | `/api/sources/jobs/[jobId]` | GET |
| 16 | `/api/sources/export` | GET |
| 17 | `/api/users/me` | GET, PUT |
| 18 | `/api/admin/allowlist` | GET, POST |
| 19 | `/api/admin/allowlist/[username]` | DELETE |

Shared mock data in `web/src/app/api/_mock/data.ts`: 2 sources, 5 articles (mixed read/unread/starred), 2 highlights, admin user.

## Page Test Matrix

6 pages x 4 configurations = 24 tests

| Page | Light Desktop | Dark Desktop | Light Mobile | Dark Mobile |
|------|:---:|:---:|:---:|:---:|
| Feed (/) | PASS | PASS | PASS | PASS |
| Reader (/read/1) | PASS | PASS | PASS | PASS |
| Sources (/sources) | PASS | PASS | PASS | PASS |
| Settings (/settings) | PASS | PASS | PASS | PASS |
| Admin (/admin) | PASS | PASS | PASS | PASS |
| Highlights (/highlights) | PASS | PASS | PASS | PASS |

**Result: 24/24 passing**

## Bugs Found & Fixed

### 1. Sources page duplicate navbar (fixed)
- **Commit:** `459cb1c`
- **Root cause:** `sources/page.tsx` rendered its own navbar while `(app)/layout.tsx` already provides a shared one
- **Fix:** Removed the inline navbar block from `sources/page.tsx`

### 2. Dark mode CSS variables (fixed in prior session)
- **Commit:** `ac5c573`
- **Root cause:** Several components used hardcoded colors instead of CSS custom properties
- **Fix:** Applied dark mode CSS variables to remaining components

### 3. bg-nav / text-inverse contrast (fixed in prior session)
- **Commit:** `5288016`
- **Root cause:** Dark mode nav background and inverse text had insufficient contrast
- **Fix:** Adjusted token values for dark mode

### 4. API proxy rewrite for local dev (fixed in prior session)
- **Commit:** `44be041`
- **Root cause:** Frontend couldn't reach Go backend in local dev
- **Fix:** Added API proxy rewrite in `next.config.ts` (currently commented out for mock mode)

## Backend Migration Notes

When switching back to the real Go backend:

1. Uncomment the API rewrites in `web/next.config.ts`
2. The mock routes under `web/src/app/api/` can be left in place (App Router routes take priority over rewrites) or deleted
3. Ensure Go backend is running on the configured upstream port
