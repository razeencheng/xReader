# Read Filter Rectangular Tuning

**Date:** 2026-04-30
**Scope:** Feed read-state filter visual tuning

## Summary

- Tuned the `未读 / 全部 / 已读` segmented control from pill-like rounding to a lower-radius rectangular shape.
- Reduced the outer control radius to `10px` and the active segment radius to `8px`.
- Slightly increased segment height so the control reads more like the provided rectangular reference while still fitting the feed sidebar with the bulk read action.

## Verification

- `cd web && pnpm vitest run src/components/feed/FeedList.test.tsx --testNamePattern "renders read filters as a segmented control"` failed before the style update, then passed.
- `cd web && pnpm vitest run src/components/feed/FeedList.test.tsx` passed.
- `cd web && pnpm exec eslint src/components/feed/FeedList.tsx src/components/feed/ReadFilterSegmentedControl.tsx src/components/feed/FeedList.test.tsx` passed.
- `cd web && pnpm build` passed.
- Playwright verified the live rendered control at `182x38`, with `10px` outer radius and `8px` active radius, and saved `/tmp/xreader-read-filter-rect.png`.
