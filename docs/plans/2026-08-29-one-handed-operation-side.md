# One-Handed Operation Side Implementation Plan

> **For Codex agent:** REQUIRED SUB-SKILL: Use codex:executing-plans to implement this plan task-by-task.

**Goal:** Add a device-local left/right one-handed operation preference that repositions six compact-layout control groups without mirroring content, text, or desktop layout.

**Architecture:** Extend the existing Zustand UI store with an `OperationSide` preference and expose it as `data-operation-side` on `<html>`. A shared compact-only selector changes the preference and a global notice survives closing whichever panel initiated the change. Edge-anchored controls use one semantic CSS utility; ordered control groups read the same store value and restore their current layout at `md` and above.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zustand 5, Tailwind CSS 4, CSS Modules, Vitest/Testing Library, Playwright.

---

## Constraints and accepted behavior

- Follow @test-driven-development for every task and @verification-before-completion before claiming success.
- Frontend only: no API, database migration, generated SQL, or dependency changes.
- `right` is the safe/default value. The preference is stored as `xreader:operationSide` in the current browser and is shared across guest/login/logout states.
- The selector is rendered only in compact UI (`md:hidden`). At `md` and above, every changed control returns to its current physical placement while the stored preference remains unchanged.
- Move control-group anchors only. Do not reverse internal action order, text direction, arrow meaning, reading order, gestures, centered notices, selection-positioned tools, state markers, or full-width bottom sheets.
- Comfortable and compact feed rows both follow the operation edge on mobile. This intentionally moves the compact row's existing mark-read action to the right in the default mode; the owner explicitly approved that consistency fix.
- The repository requires one user task per commit. Do not commit after internal TDD tasks; make one conventional commit only after the full verification matrix passes.
- Preserve the unrelated pre-existing `.gitignore` modification. Never stage it as part of this feature.
- The tracked ignore rules contain `docs/**`; keep that rule unchanged and force-add only this exact plan file when the feature is ready to commit.

## Placement contract

| Surface | Right/default | Left compact layout | `md` and above |
|---|---|---|---|
| Reader advance | bottom-right | bottom-left | current bottom-right behavior |
| Mobile top bar | brand left, menu right | menu left, brand right | component hidden |
| Comfortable feed actions | row end | row start | current row end |
| Compact feed mark-read | row end (approved correction) | row start | current row start |
| Reader header | current layout | back icon, star, overflow at left; metadata after them | current layout |
| Reader tweaks | bottom-right | bottom-left | current bottom-right |
| Sources tweaks | bottom-right | bottom-left | current bottom-right |

### Task 1: Add the preference model and semantic operation edge

**Files:**
- Modify: `web/src/stores/useUIStore.ts:6-257`
- Modify: `web/src/stores/useUIStore.test.ts:1-74`
- Modify: `web/src/components/ThemeProvider.tsx:20-44`
- Create: `web/src/components/ThemeProvider.test.tsx`
- Modify: `web/src/app/globals.css:547-723`

**Step 1: Write failing store tests**

Reset `operationSide: 'right'`, `operationSideNotice: null`, and `_hydrated: false` in `beforeEach`, then add tests for default behavior, persistence, hydration validation, and storage failure:

```ts
test('operation side is device-local and defaults to right', () => {
  expect(useUIStore.getState().operationSide).toBe('right');
  useUIStore.getState().setOperationSide('left');
  expect(useUIStore.getState().operationSide).toBe('left');
  expect(useUIStore.getState().operationSideNotice).toBe('left');
  expect(localStorage.getItem('xreader:operationSide')).toBe('left');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('hydrates only valid stored operation sides', () => {
  localStorage.setItem('xreader:operationSide', 'left');
  useUIStore.getState().hydrateFromLocalStorage();
  expect(useUIStore.getState().operationSide).toBe('left');

  useUIStore.setState({ operationSide: 'right', _hydrated: false });
  localStorage.setItem('xreader:operationSide', 'up');
  useUIStore.getState().hydrateFromLocalStorage();
  expect(useUIStore.getState().operationSide).toBe('right');
});

test('keeps the session value when localStorage write fails', () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => useUIStore.getState().setOperationSide('left')).not.toThrow();
  expect(useUIStore.getState().operationSide).toBe('left');
});
```

**Step 2: Run the store test and verify RED**

Run: `cd web && pnpm vitest run src/stores/useUIStore.test.ts`

Expected: FAIL because `operationSide`, `operationSideNotice`, and `setOperationSide` do not exist.

**Step 3: Implement the minimal store state**

Add the closed type and state/actions:

```ts
export type OperationSide = 'left' | 'right';

// UIState
operationSide: OperationSide;
operationSideNotice: OperationSide | null;
setOperationSide: (side: OperationSide) => void;
clearOperationSideNotice: () => void;

const validOperationSides: readonly OperationSide[] = ['left', 'right'];
const isValidOperationSide = (value: unknown): value is OperationSide =>
  validOperationSides.includes(value as OperationSide);

// initial state
operationSide: 'right',
operationSideNotice: null,

setOperationSide: (operationSide) => {
  if (get().operationSide === operationSide) return;
  set({ operationSide, operationSideNotice: operationSide });
  persist('operationSide', operationSide);
},
clearOperationSideNotice: () => set({ operationSideNotice: null }),
```

In `hydrateFromLocalStorage`, read `operationSide` and assign it only when `isValidOperationSide` returns true. Do not add it to the three keys synchronized through `/api/users/me`; account hydration must not overwrite it.

**Step 4: Write the failing root-attribute test**

Stub `matchMedia`, render `ThemeProvider`, and assert the root attribute follows store updates:

```tsx
test('publishes the physical operation side on the document root', async () => {
  useUIStore.setState({ operationSide: 'left' });
  render(<ThemeProvider><div>content</div></ThemeProvider>);
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-operation-side', 'left'));

  act(() => useUIStore.getState().setOperationSide('right'));
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-operation-side', 'right'));
});
```

Run: `cd web && pnpm vitest run src/components/ThemeProvider.test.tsx`

Expected: FAIL because the attribute is not written.

**Step 5: Publish the attribute and add one semantic CSS anchor**

Select `operationSide` in `ThemeProvider` and set it in the existing effect:

```ts
el.setAttribute('data-operation-side', operationSide);
```

Include it in the dependency array. Add a physical-edge utility to `globals.css`:

```css
@layer utilities {
  .operation-edge-anchor {
    --operation-edge-offset: 1rem;
    left: auto;
    right: max(var(--operation-edge-offset), env(safe-area-inset-right));
  }

  @media (max-width: 767px) {
    html[data-operation-side="left"] .operation-edge-anchor {
      left: max(var(--operation-edge-offset), env(safe-area-inset-left));
      right: auto;
    }
  }
}
```

The media query is mandatory: a stored left choice must not move controls at `md` or above.

**Step 6: Run focused tests and verify GREEN**

Run: `cd web && pnpm vitest run src/stores/useUIStore.test.ts src/components/ThemeProvider.test.tsx`

Expected: both files PASS; no network request is made for `operationSide`.

### Task 2: Build the shared selector, localized notice, and global feedback host

**Files:**
- Modify: `web/src/lib/i18n.ts:22-953`
- Modify: `web/src/lib/i18n.test.ts:14-52`
- Create: `web/src/components/settings/OperationSideControl.tsx`
- Create: `web/src/components/settings/OperationSideControl.test.tsx`
- Create: `web/src/components/layout/OperationSideNotice.tsx`
- Create: `web/src/components/layout/OperationSideNotice.test.tsx`
- Modify: `web/src/app/(app)/layout.tsx:13-92`

**Step 1: Write failing localization expectations**

Add exact Chinese/English expectations and assert every supported language has localized left/right labels rather than a missing key. Also update the settings description test so it no longer mentions “bottom-right”.

```ts
expect(translate('zh-CN', 'operationSide.title')).toBe('单手操作');
expect(translate('zh-CN', 'operationSide.changed', { side: '左侧' })).toBe('单手操作已切换到左侧');
expect(translate('en', 'operationSide.description')).toBe('Place common phone controls on the side that feels easiest to reach.');
expect(translate('zh-CN', 'settings.description')).not.toContain('右下角');
```

Run: `cd web && pnpm vitest run src/lib/i18n.test.ts`

Expected: FAIL with the untranslated keys.

**Step 2: Add complete messages**

Add these keys to `en` and `zh`; `zh-TW` continues to use `traditionalize(zh)`:

```ts
'operationSide.title': 'One-handed controls',
'operationSide.description': 'Place common phone controls on the side that feels easiest to reach.',
'operationSide.left': 'Left',
'operationSide.right': 'Right',
'operationSide.changed': ({ side }) => `One-handed controls moved to the ${side}`,
```

```ts
'operationSide.title': '单手操作',
'operationSide.description': '将手机上的常用操作放到顺手的一侧。',
'operationSide.left': '左侧',
'operationSide.right': '右侧',
'operationSide.changed': ({ side }) => `单手操作已切换到${side}`,
```

Add equivalent overrides to the seven supplemental dictionaries:

| Language | Title | Left / Right | Changed template |
|---|---|---|---|
| ja | 片手操作 | 左側 / 右側 | `片手操作を${side}に切り替えました` |
| ko | 한 손 조작 | 왼쪽 / 오른쪽 | `한 손 조작을 ${side}으로 전환했습니다` |
| es | Uso con una mano | Izquierda / Derecha | `Controles movidos a la ${side}` |
| fr | Utilisation à une main | Gauche / Droite | `Commandes déplacées à ${side}` |
| de | Einhandbedienung | Links / Rechts | `Einhandbedienung auf ${side} umgestellt` |
| pt | Uso com uma mão | Esquerda / Direita | `Controles movidos para a ${side}` |

Include a natural localized description in each dictionary. Rewrite `settings.description` in English and Chinese to say reading preferences live in the article reader's reading-settings panel, without naming a physical edge.

**Step 3: Write the shared-control test first**

Test compact-only rendering, selected state, minimum target size, persistence, no-op behavior, and callback:

```tsx
test('selects a new operation side and asks the host to close', async () => {
  const onSelected = vi.fn();
  useUIStore.setState({ operationSide: 'right', operationSideNotice: null });
  render(<OperationSideControl onSelected={onSelected} />);

  const left = screen.getByRole('button', { name: '左侧' });
  expect(left).toHaveClass('min-h-11');
  expect(screen.getByRole('button', { name: '右侧' })).toHaveAttribute('aria-pressed', 'true');

  await userEvent.click(left);
  expect(useUIStore.getState().operationSide).toBe('left');
  expect(onSelected).toHaveBeenCalledTimes(1);
});
```

Run: `cd web && pnpm vitest run src/components/settings/OperationSideControl.test.tsx`

Expected: FAIL because the component does not exist.

**Step 4: Implement `OperationSideControl`**

Create a reusable, compact-only section. It owns no transient state and calls `onSelected` only when the value actually changes:

```tsx
'use client';

import { useI18n } from '@/lib/i18n';
import { type OperationSide, useUIStore } from '@/stores/useUIStore';

export function OperationSideControl({ onSelected, className = '' }: {
  onSelected?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const operationSide = useUIStore((state) => state.operationSide);
  const setOperationSide = useUIStore((state) => state.setOperationSide);
  const options: OperationSide[] = ['left', 'right'];

  return (
    <section className={`md:hidden ${className}`}>
      <div className="text-[11px] font-semibold tracking-[0.12em] text-[var(--text-3)]">
        {t('operationSide.title')}
      </div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-3)]">{t('operationSide.description')}</p>
      <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={t('operationSide.title')}>
        {options.map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={operationSide === side}
            className={`${operationSide === side ? 'ui-pill-active' : 'ui-pill-neutral'} min-h-11`}
            onClick={() => {
              if (side === operationSide) return;
              setOperationSide(side);
              onSelected?.();
            }}
          >
            {t(`operationSide.${side}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
```

**Step 5: Write and implement the persistent global notice**

Test with fake timers that a notice renders with `role="status"`, uses the localized side, respects the safe area, and clears itself after about 1.8 seconds. Then implement `OperationSideNotice`:

```tsx
export function OperationSideNotice() {
  const { t } = useI18n();
  const notice = useUIStore((state) => state.operationSideNotice);
  const clear = useUIStore((state) => state.clearOperationSideNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clear, 1800);
    return () => window.clearTimeout(timer);
  }, [clear, notice]);

  if (!notice) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed bottom-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] left-1/2 z-[150] -translate-x-1/2 rounded-full bg-[var(--text)] px-4 py-2 text-sm text-[var(--bg)] shadow-lg motion-reduce:transition-none">
      {t('operationSide.changed', { side: t(`operationSide.${notice}`) })}
    </div>
  );
}
```

Mount it once in `AppLayout`, alongside `KeyboardShortcutsModal` and `SourceImportStatus`, so closing a menu cannot unmount the feedback.

**Step 6: Run the shared UI tests**

Run: `cd web && pnpm vitest run src/lib/i18n.test.ts src/components/settings/OperationSideControl.test.tsx src/components/layout/OperationSideNotice.test.tsx`

Expected: all PASS, including timer cleanup and all supported UI languages.

### Task 3: Add the mobile-menu entry and swap the compact top bar

**Files:**
- Modify: `web/src/components/layout/ResponsiveAppNav.tsx:192-340`
- Modify: `web/src/components/layout/ResponsiveAppNav.test.tsx:15-75`

**Step 1: Write failing behavior tests**

Reset `operationSide: 'right'` in `beforeEach`. Add tests that:

- right mode renders the brand button before the menu trigger;
- left mode renders the menu trigger before the brand, preserving visual and keyboard order;
- opening the full-width menu exposes the shared selector;
- choosing left closes the dialog, sets the store/local value, and leaves `operationSideNotice: 'left'` for the global host;
- the bottom sheet retains `inset-x-0` in either mode.

Use stable `data-testid="mobile-topbar-row"` and `data-testid="mobile-menu-trigger"` hooks for order assertions; continue querying actual actions by accessible name.

Run: `cd web && pnpm vitest run src/components/layout/ResponsiveAppNav.test.tsx`

Expected: FAIL because there is no selector and the row never swaps.

**Step 2: Implement the minimal top-bar behavior**

Select `operationSide` in `MobileTopBar`. Factor the existing brand and menu buttons into elements and render them in physical order:

```tsx
<div data-testid="mobile-topbar-row" className="flex h-14 items-center justify-between px-4">
  {operationSide === 'left' ? <>{menuButton}{brandButton}</> : <>{brandButton}{menuButton}</>}
</div>
```

Do not use `flex-row-reverse`, because that would make visual and keyboard focus order disagree. Add a final compact section to the existing bottom sheet:

```tsx
<OperationSideControl className="mt-5 border-t border-[var(--border-light)] pt-5"
  onSelected={() => setIsMenuOpen(false)} />
```

The sheet itself remains full width and is not mirrored.

**Step 3: Run the mobile navigation test**

Run: `cd web && pnpm vitest run src/components/layout/ResponsiveAppNav.test.tsx`

Expected: PASS; existing navigation/highlights tests remain green.

### Task 4: Move the reader controls as one coherent compact control layer

**Files:**
- Modify: `web/src/components/reader/ReaderHeader.tsx:30-174`
- Modify: `web/src/components/reader/ReaderHeader.test.tsx:1-25`
- Modify: `web/src/components/reader/ReaderAdvanceButton.tsx:14-38`
- Modify: `web/src/components/reader/ReaderAdvanceButton.test.tsx:1-35`
- Modify: `web/src/components/reader/TweaksPanel.tsx:57-192`
- Modify: `web/src/components/reader/TweaksPanel.test.tsx:6-50`

**Step 1: Write failing reader-header tests**

Render all mobile actions (`onBack`, `onToggleStar`, `onOpenTweaks`) in both modes. In left mode assert:

- back, star, and overflow have mobile order 1/2/3;
- metadata has mobile order 4;
- the visible “返回” text is hidden while the accessible back label remains;
- the overflow panel uses `left-0 right-auto`;
- every order override includes `md:order-none`, preserving desktop.

Also assert right mode keeps the existing DOM/classes.

Run: `cd web && pnpm vitest run src/components/reader/ReaderHeader.test.tsx`

Expected: FAIL because the header does not consume `operationSide`.

**Step 2: Implement reader-header ordering without reversing semantics**

Select `operationSide`; for left mode use CSS order classes on the existing elements rather than duplicating actions:

```ts
const compactLeft = operationSide === 'left';
```

- Back: `order-1 md:order-none`; hide only its compact visible text when `compactLeft`.
- Star: `order-2 md:order-none` in left mode.
- Overflow wrapper: `order-3 md:order-none` in left mode.
- Metadata: `order-4 md:order-none` in left mode.
- Overflow popup: `left-0 right-auto` in left mode, existing `right-0` otherwise.

Keep `ArrowLeft` unchanged and keep the focus order back → star → more.

**Step 3: Write failing advance/tweaks tests**

- `ReaderAdvanceButton` must have `operation-edge-anchor`, a one-rem edge offset, bottom safe-area style, and the existing 48px target.
- `TweaksPanel` must have the same semantic edge class with a `1.25rem` offset.
- The operation-side selector must be `md:hidden` inside reader tweaks.
- Choosing a new side calls `onExternalClose`, changes the preference, and leaves the notice available globally.

Run: `cd web && pnpm vitest run src/components/reader/ReaderAdvanceButton.test.tsx src/components/reader/TweaksPanel.test.tsx`

Expected: FAIL before the semantic anchor and selector are integrated.

**Step 4: Implement advance and tweaks anchoring**

Replace the hard-coded advance `right` style with the utility and a custom offset:

```tsx
className="operation-edge-anchor fixed ..."
style={{
  '--operation-edge-offset': '1rem',
  bottom: 'max(1rem, env(safe-area-inset-bottom))',
} as React.CSSProperties}
```

Change `TweaksPanel`'s outer wrapper to `operation-edge-anchor absolute bottom-5 z-[100]`, set `--operation-edge-offset: 1.25rem`, and append:

```tsx
<OperationSideControl onSelected={closePanel} className="mt-4 border-t border-[var(--border-light)] pt-4" />
```

The selector closes the panel immediately. Do not animate the panel across the screen.

**Step 5: Run all reader-focused tests**

Run: `cd web && pnpm vitest run src/components/reader/ReaderHeader.test.tsx src/components/reader/ReaderAdvanceButton.test.tsx src/components/reader/TweaksPanel.test.tsx src/components/reader/ArticleReader.test.tsx`

Expected: all PASS; advance hiding during scroll/selection/tweaks remains unchanged.

### Task 5: Make both feed densities follow the compact operation edge

**Files:**
- Modify: `web/src/components/feed/FeedRowComfortable.tsx:19-127`
- Modify: `web/src/components/feed/FeedRowComfortable.test.tsx:29-55`
- Modify: `web/src/components/feed/FeedRowCompact.tsx:19-90`
- Modify: `web/src/components/feed/FeedRowCompact.test.tsx:17-38`

**Step 1: Write failing placement tests**

For each row, reset the store to right, render an actionable article, and query `data-testid="feed-row-actions"`.

Expected contracts:

```ts
// Comfortable
expect(rightActions).toHaveClass('ml-auto');
expect(leftActions).toHaveClass('order-first', 'mr-auto', 'md:order-last', 'md:ml-auto');

// Compact: approved default correction on mobile, desktop restored
expect(rightActions).toHaveClass('justify-end', 'md:justify-start');
expect(leftActions).toHaveClass('justify-start');
```

Retain the existing 44px action-target assertions and add a test proving mark-read/star DOM order does not reverse.

Run: `cd web && pnpm vitest run src/components/feed/FeedRowComfortable.test.tsx src/components/feed/FeedRowCompact.test.tsx`

Expected: FAIL because the actions are not grouped by operation side.

**Step 2: Implement one action group per row**

Select `operationSide` in both rows.

For comfortable rows, wrap mark-read/undo and star in one `flex` group. In left compact mode make that group `order-first mr-auto`, then restore current desktop placement with `md:order-last md:ml-auto md:mr-0`. Preserve the action DOM order exactly.

For compact rows, wrap the existing single mark-read/undo action in a full-width flex row:

```tsx
<div data-testid="feed-row-actions"
  className={`mt-[6px] flex ${operationSide === 'left' ? 'justify-start' : 'justify-end md:justify-start'}`}>
  {action}
</div>
```

Keep the selected-state indicator physically left because it is content state, not an operation control.

**Step 3: Run feed row and list regressions**

Run: `cd web && pnpm vitest run src/components/feed/FeedRowComfortable.test.tsx src/components/feed/FeedRowCompact.test.tsx src/components/feed/FeedList.test.tsx`

Expected: all PASS; read-state behavior and the existing list shell remain unchanged.

### Task 6: Anchor the Sources display controls and panel

**Files:**
- Modify: `web/src/app/(app)/sources/page.tsx:404-433,957-1012`
- Modify: `web/src/app/(app)/sources/SourcesPage.module.css:909-928`
- Create: `web/src/app/(app)/sources/page.test.tsx`

**Step 1: Add a failing page-level test**

Mock `@/lib/queries/sources` with an empty source list and idle mutation/query objects. Render `SourcesPage`, then assert:

- “显示调整/微调” button has `operation-edge-anchor` and a 16px edge offset;
- clicking it renders a panel with the same semantic anchor;
- the panel remains connected to the button and its close action still works;
- no operation-side selector is added here (the two agreed settings entries are mobile navigation and reader tweaks).

Minimal hook mock shape:

```ts
vi.mock('@/lib/queries/sources', () => ({
  getSourceImportCompleted: () => 0,
  getSourceImportProgress: () => 0,
  isSourceImportLookupExpired: () => false,
  useSources: () => ({ data: [], isLoading: false }),
  useCreateSource: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useDeleteSource: () => ({ mutateAsync: vi.fn() }),
  useRefreshSource: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useSourceImportJob: () => ({ data: null, error: null, isError: false }),
}));
```

Run: `cd web && pnpm vitest run 'src/app/(app)/sources/page.test.tsx'`

Expected: FAIL because both elements still hard-code `right: 16px`.

**Step 2: Apply the semantic anchor**

Add `operation-edge-anchor` to both class lists and set `--operation-edge-offset: 16px`. Remove the physical `right: 16px` declarations from `.tweaksButton` and `.tweaksPanel`; keep position, bottom offsets, widths, and z-index unchanged.

Because the shared utility switches sides only below 768px, Sources remains bottom-right on tablet/desktop even when the stored value is left.

**Step 3: Run the Sources test**

Run: `cd web && pnpm vitest run 'src/app/(app)/sources/page.test.tsx'`

Expected: PASS; no network access is needed.

### Task 7: Add real-browser coverage and run the complete verification gate

**Files:**
- Create: `web/e2e/operation-side.spec.ts`
- Verify: `CONTEXT.md`
- Verify: `docs/plans/2026-08-29-one-handed-operation-side.md`

**Step 1: Write the Playwright scenario before the final implementation run**

Reuse the route-mocking style from `web/e2e/mobile-reader-overflow.spec.ts`. Provide two articles so the touch-only reader advance button is rendered. Run the same core scenario at widths 375 and 430:

```ts
for (const width of [375, 430]) {
  test.describe(`${width}px operation side`, () => {
    test.use({ viewport: { width, height: width === 375 ? 812 : 932 }, isMobile: true, hasTouch: true });

    test('switches, persists, and places compact controls on the selected edge', async ({ page }) => {
      // mock /api/auth/me, /api/articles, detail, highlights, changes, and /api/sources
      // open the mobile menu, choose 左侧, and assert the dialog closes + centered status appears
      // assert localStorage.getItem('xreader:operationSide') === 'left'
      // compare menu/brand bounding boxes: menu is left of brand
      // open an article and assert advance + header actions occupy the left half
      // open reader tweaks and verify 左侧 is aria-pressed
      // visit /sources and assert the display-tweaks button is in the left half
      // reload and assert the stored left choice still applies
      // widen to 900px and assert any visible edge-anchored reader control returns right
    });
  });
}
```

Use bounding boxes rather than class names so the test proves actual layout. Assert no horizontal overflow and that every checked rectangle stays within the viewport/safe-area bounds.

**Step 2: Run focused E2E and verify the two phone widths**

Run: `cd web && pnpm exec playwright test e2e/operation-side.spec.ts --project=chromium`

Expected: `2 passed`. If the dev server cannot bind because of the sandbox, rerun in an approved environment and report the original limitation; do not replace browser validation with weaker assertions.

**Step 3: Perform visual QA**

Using @browser:control-in-app-browser against the local dev server, inspect 375×812 and 430×932 in both left/right modes:

- no overlap between the edge action and centered notice;
- left/right safe-area padding is symmetric;
- reader header metadata truncates rather than pushing actions off-screen;
- attached menus open inward;
- full-width mobile navigation sheet does not mirror;
- no cross-screen animation when switching, and `prefers-reduced-motion` remains calm.

Capture temporary screenshots outside the repository if useful; do not add screenshot artifacts unless explicitly requested.

**Step 4: Run the complete frontend gate**

Run:

```bash
cd web && pnpm vitest run
cd web && pnpm lint
cd web && pnpm build
```

Expected:

- all Vitest files PASS;
- ESLint/TypeScript reports no new errors or warnings;
- Next production export completes and refreshes `web/out/` as expected by the existing build setup.

Then run the integrated build from the repository root:

```bash
make build
```

Expected: frontend build and Go single-binary build both complete successfully. No backend test suite is required for this frontend-only change unless the integrated build exposes a server/embed regression.

**Step 5: Review the final diff and make the single feature commit**

Run:

```bash
git diff --check
git status --short
git diff -- CONTEXT.md docs/plans/2026-08-29-one-handed-operation-side.md web/src web/e2e/operation-side.spec.ts
```

Confirm `.gitignore` is still modified but absent from the feature diff/staging set. Stage only the explicit feature files; do not use `git add -A` or `git add .`.

```bash
git add CONTEXT.md \
  web/src/stores/useUIStore.ts \
  web/src/stores/useUIStore.test.ts \
  web/src/components/ThemeProvider.tsx \
  web/src/components/ThemeProvider.test.tsx \
  web/src/app/globals.css \
  web/src/lib/i18n.ts \
  web/src/lib/i18n.test.ts \
  web/src/components/settings/OperationSideControl.tsx \
  web/src/components/settings/OperationSideControl.test.tsx \
  web/src/components/layout/OperationSideNotice.tsx \
  web/src/components/layout/OperationSideNotice.test.tsx \
  'web/src/app/(app)/layout.tsx' \
  web/src/components/layout/ResponsiveAppNav.tsx \
  web/src/components/layout/ResponsiveAppNav.test.tsx \
  web/src/components/reader/ReaderHeader.tsx \
  web/src/components/reader/ReaderHeader.test.tsx \
  web/src/components/reader/ReaderAdvanceButton.tsx \
  web/src/components/reader/ReaderAdvanceButton.test.tsx \
  web/src/components/reader/TweaksPanel.tsx \
  web/src/components/reader/TweaksPanel.test.tsx \
  web/src/components/feed/FeedRowComfortable.tsx \
  web/src/components/feed/FeedRowComfortable.test.tsx \
  web/src/components/feed/FeedRowCompact.tsx \
  web/src/components/feed/FeedRowCompact.test.tsx \
  'web/src/app/(app)/sources/page.tsx' \
  'web/src/app/(app)/sources/page.test.tsx' \
  'web/src/app/(app)/sources/SourcesPage.module.css' \
  web/e2e/operation-side.spec.ts
git add -f docs/plans/2026-08-29-one-handed-operation-side.md
git diff --cached --check
git status --short
```

Expected: every feature file is staged, the ignored plan is included deliberately, and `.gitignore` remains only an unstaged working-tree modification.

Commit once:

```bash
git commit -m "feat(ui): add one-handed operation side"
```

Expected: one conventional commit containing the glossary, plan, implementation, and tests; the unrelated `.gitignore` change remains unstaged.
