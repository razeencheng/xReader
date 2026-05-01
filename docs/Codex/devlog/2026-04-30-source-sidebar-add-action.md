# Source Sidebar Add Action

**Date:** 2026-04-30
**Scope:** Source browser and desktop sidebar actions

## Summary

- Removed the `管理` action from the source browser header to avoid duplicating the separate source management entry point.
- Moved the add-source shortcut from the bottom utility group into the primary sidebar navigation, directly below `订阅源`.
- Replaced the circular plus icon with Lucide `BadgePlus`, keeping the same line-icon style and stroke weight as the surrounding sidebar icons.
- Added regression tests for the missing header management link and the sidebar button order.

## Verification

- `cd web && pnpm vitest run src/components/layout/SourceBrowser.test.tsx src/components/layout/Sidebar.test.tsx` failed before implementation, then passed.
- `cd web && pnpm vitest run` passed: 36 files, 115 tests.
- `cd web && pnpm exec eslint src/components/layout/SourceBrowser.tsx src/components/layout/Sidebar.tsx src/components/layout/SourceBrowser.test.tsx src/components/layout/Sidebar.test.tsx` passed.
- `cd web && pnpm build` passed.

## Notes

- Full `cd web && pnpm lint` still fails on pre-existing `no-explicit-any` issues in `src/lib/api-client.test.ts`, `src/stores/useUIStore.test.ts`, and `src/test-setup.ts`.
