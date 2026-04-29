# Reader Translation Order

**Date:** 2026-04-29
**Scope:** Reader bilingual body rendering

## Summary

- Fixed body translations drifting ahead of their original paragraphs after empty article blocks.
- Split reader rendering blocks from backend translation indexes so textless placeholders no longer consume a paragraph index.
- Preserved rendering for media-only blocks while excluding them from translation requests.
- Added a regression test for a heading followed by an empty block, prose, and a code block.

## Verification

- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx -t "keeps translations attached"` failed before the fix, then passed.
- `cd web && pnpm vitest run src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm exec eslint src/components/reader/BilingualBody.tsx src/components/reader/BilingualBody.test.tsx` passed.
- `cd web && pnpm build` passed.
- `cd web && pnpm vitest run` passed.
