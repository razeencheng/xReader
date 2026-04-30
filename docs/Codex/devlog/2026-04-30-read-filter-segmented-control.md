# Read Filter Segmented Control

**Date:** 2026-04-30
**Scope:** Feed read-state filter styling

## Summary

- Replaced the inline `未读 / 全部 / 已读` pill buttons with a dedicated segmented control component.
- Matched the requested visual direction: pale rounded container, white active segment, darker active text, muted counts, and soft active shadow.
- Added `role="group"` plus `aria-pressed` on each segment so the selected read filter is explicit to assistive technology.
- Left the existing read-filter behavior, counts, and bulk mark-read flow unchanged.

## Verification

- `cd web && pnpm vitest run src/components/feed/FeedList.test.tsx --testNamePattern "renders read filters as a segmented control"` failed before the implementation, then passed.
- `cd web && pnpm vitest run src/components/feed/FeedList.test.tsx` passed.
- `cd web && pnpm vitest run` passed.
- `cd web && pnpm exec eslint src/components/feed/FeedList.tsx src/components/feed/ReadFilterSegmentedControl.tsx src/components/feed/FeedList.test.tsx` passed.
- `cd web && pnpm build` passed.
- Playwright verified the live rendered control with mocked API data and saved `/tmp/xreader-read-filter-segmented.png`.

## Notes

- Full `cd web && pnpm lint` still fails on pre-existing `no-explicit-any` issues in `src/lib/api-client.test.ts`, `src/stores/useUIStore.test.ts`, and `src/test-setup.ts`.
