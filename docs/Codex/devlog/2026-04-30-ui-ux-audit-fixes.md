# UI/UX audit fixes

## Scope

- Fixed admin allowlist dates by reading the backend `added_at` field instead of the nonexistent `created_at`.
- Increased mobile/touch targets for feed row actions, read filters, density/tabs, highlight toolbar/editor actions, original-article actions, source excerpt actions, sidebar buttons, and shortcut modal close.
- Added safe-area bottom handling for reader tweaks, keyboard shortcuts, reader prev/next bar, and Sources page fixed controls/toasts.
- Kept the reader prev/next bar visible on mobile and removed the undefined `hide-mobile` class.
- Limited wide reader layout to `max-w-[960px]`, aligned reader skeleton padding, removed FeedSkeleton's mismatched wide container, localized the stale login E2E assertion, and replaced dark-mode-hostile white/error hardcodes with CSS variables.
- Changed Settings/Admin/Highlights pages to scroll correctly inside `AppLayout`.

## Verification

- `pnpm lint`
- `pnpm vitest run`
- `pnpm build`
- `pnpm exec playwright test e2e/mobile-reader-overflow.spec.ts e2e/login.spec.ts`
- Restarted Next dev on `http://localhost:3000`.
- Ran a temporary Playwright smoke test for `/admin` date formatting and mobile `/read/1?ctx=today` prev/next visibility.

## Review follow-up

- Restored desktop compactness for the `全部已读` pill with `md:min-h-0`.
- Tightened the login E2E assertion to the current localized label `使用 GitHub 登录`.
- Verified `AllowlistEntry` does not include `role`: the backend allowlist response and design spec expose `github_username`, `added_by_user_id`, `added_at`, and `note`; this checkout does not contain `server/api/openapi.yaml`.
