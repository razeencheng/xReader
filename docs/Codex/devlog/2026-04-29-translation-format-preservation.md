# Translation Format Preservation

**Date:** 2026-04-29
**Scope:** Reader translated block rendering

## Summary

- Changed translated blocks to preserve the original block semantics for headings and list items.
- Heading translations now render as the same heading level, such as `h2` translating to `h2`.
- List item translations now render inside the same list type (`ul` or `ol`) with a translated `li`.
- Translation text is HTML-escaped before being wrapped in semantic markup.

## Verification

- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx -t "heading translations"` failed before the fix, then passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx -t "list item translations"` failed before the fix, then passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm exec eslint src/components/reader/BilingualBody.tsx src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm build` passed.
- `cd web && pnpm vitest run` passed.
