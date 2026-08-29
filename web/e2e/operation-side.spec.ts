import { expect, test, type Locator, type Page } from 'playwright/test';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Viewport {
  width: number;
  height: number;
}

const user = {
  id: 1,
  github_username: 'jin',
  role: 'user',
  native_language: 'zh-CN',
  density_pref: 'comfortable',
  theme_pref: 'light',
};

const articles = [
  {
    id: 1,
    source_id: 1,
    title: '单手操作测试文章一',
    link: 'https://example.com/articles/one',
    language: 'zh-CN',
    source_title: '测试来源',
    published_at: '2026-08-29T12:00:00Z',
    summary: '用于验证左侧单手操作的阅读器控件。',
    word_count: 420,
    is_read: false,
    is_starred: false,
    state_version: null,
  },
  {
    id: 2,
    source_id: 1,
    title: '单手操作测试文章二',
    link: 'https://example.com/articles/two',
    language: 'zh-CN',
    source_title: '测试来源',
    published_at: '2026-08-29T11:00:00Z',
    summary: '第二篇文章让触屏阅读器显示“已读并下一篇”按钮。',
    word_count: 360,
    is_read: false,
    is_starred: false,
    state_version: null,
  },
];

const articleBody = Array.from({ length: 14 }, (_, index) => `
  <p>第 ${index + 1} 段用于端到端几何验证。操作侧只改变触屏控件所在的边缘，不改变内容顺序、文字方向或动作含义。返回、收藏和更多操作仍然保持原有顺序，浮层从所选边缘向屏幕内部展开。</p>
`).join('');

const mobileViewports: Viewport[] = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
];

async function mockApp(page: Page) {
  const unexpectedApiUrls: string[] = [];

  // Keep every request local to the test. More specific routes registered below
  // take precedence over this diagnostic fallback.
  await page.route('**/api/**', (route) => {
    unexpectedApiUrls.push(route.request().url());
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'unexpected e2e API request' }),
    });
  });

  await page.route(/\/api\/auth\/me(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route(/\/api\/articles\/changes(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: 'e2e.operation-side', has_more: false }),
    }),
  );
  await page.route(/\/api\/articles(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        items: articles,
        next_cursor: null,
        counts: { unread: articles.length, all: articles.length, read: 0 },
      }),
    }),
  );
  await page.route(/\/api\/articles\/(1|2)\/highlights(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
  );
  await page.route(/\/api\/articles\/(1|2)\/state(?:\?.*)?$/, (route) => {
    const articleId = Number(route.request().url().match(/\/api\/articles\/(\d+)\/state/)?.[1] ?? 0);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        article_id: articleId,
        is_read: true,
        is_starred: false,
        state_version: { changed_at_micros: '1', article_id: articleId },
      }),
    });
  });
  await page.route(/\/api\/articles\/(1|2)(?:\?.*)?$/, (route) => {
    const articleId = Number(route.request().url().match(/\/api\/articles\/(\d+)/)?.[1] ?? 0);
    const article = articles.find((item) => item.id === articleId);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...article,
        content_html: articleBody,
        content_text: '单手操作测试正文',
      }),
    });
  });
  await page.route(/\/api\/sources(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
  );

  return unexpectedApiUrls;
}

async function startWithEmptyLocalStorage(page: Page) {
  await page.addInitScript(() => {
    const marker = 'xreader:e2e:operation-side-storage-cleared';
    if (sessionStorage.getItem(marker) !== 'true') {
      localStorage.clear();
      sessionStorage.setItem(marker, 'true');
    }
  });
}

async function boundsOf(locator: Locator, label: string): Promise<Bounds> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds, `${label} should have a bounding box`).not.toBeNull();
  return bounds as Bounds;
}

function expectInsideViewport(bounds: Bounds, viewport: Viewport, label: string) {
  expect(bounds.width, `${label} should have positive width`).toBeGreaterThan(0);
  expect(bounds.height, `${label} should have positive height`).toBeGreaterThan(0);
  expect(bounds.x, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y, `${label} top edge`).toBeGreaterThanOrEqual(-1);
  expect(bounds.y + bounds.height, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

function centerX(bounds: Bounds) {
  return bounds.x + bounds.width / 2;
}

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

for (const viewport of mobileViewports) {
  test.describe(`one-handed operation at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test('moves semantic edge controls, keeps overlays inward, and persists locally', async ({ page }) => {
      const unexpectedApiUrls = await mockApp(page);
      await startWithEmptyLocalStorage(page);

      await page.goto('/');
      await expect(page.getByRole('heading', { level: 3, name: '单手操作测试文章一' })).toBeVisible();

      const brand = page.getByRole('button', { name: 'xReader', exact: true });
      const menuTrigger = page.getByTestId('mobile-menu-trigger');
      const defaultBrandBounds = await boundsOf(brand, 'default brand');
      const defaultMenuBounds = await boundsOf(menuTrigger, 'default mobile menu trigger');
      expectInsideViewport(defaultBrandBounds, viewport, 'default brand');
      expectInsideViewport(defaultMenuBounds, viewport, 'default mobile menu trigger');
      expect(defaultBrandBounds.x + defaultBrandBounds.width).toBeLessThanOrEqual(defaultMenuBounds.x + 1);
      await expectNoHorizontalOverflow(page);

      await menuTrigger.click();
      const mobileMenu = page.getByRole('dialog', { name: '移动端菜单' });
      const menuBounds = await boundsOf(mobileMenu, 'full-width mobile menu');
      expectInsideViewport(menuBounds, viewport, 'full-width mobile menu');
      expect(menuBounds.x).toBeLessThanOrEqual(1);
      expect(menuBounds.x + menuBounds.width).toBeGreaterThanOrEqual(viewport.width - 1);

      await mobileMenu.getByRole('button', { name: '左侧', exact: true }).click();
      await expect(mobileMenu).toBeHidden();

      const status = page.getByRole('status').filter({ hasText: '单手操作已切换到左侧' });
      const statusBounds = await boundsOf(status, 'operation-side status');
      expectInsideViewport(statusBounds, viewport, 'operation-side status');
      expect(Math.abs(centerX(statusBounds) - viewport.width / 2)).toBeLessThanOrEqual(2);
      expect(centerX(statusBounds)).toBeGreaterThan(viewport.width * 0.4);
      expect(centerX(statusBounds)).toBeLessThan(viewport.width * 0.6);
      await expect(status).toHaveCSS('pointer-events', 'none');
      await expect.poll(() => page.evaluate(() => localStorage.getItem('xreader:operationSide'))).toBe('left');

      const leftBrandBounds = await boundsOf(brand, 'left-side brand');
      const leftMenuBounds = await boundsOf(menuTrigger, 'left-side mobile menu trigger');
      expectInsideViewport(leftBrandBounds, viewport, 'left-side brand');
      expectInsideViewport(leftMenuBounds, viewport, 'left-side mobile menu trigger');
      expect(leftMenuBounds.x + leftMenuBounds.width).toBeLessThanOrEqual(leftBrandBounds.x + 1);
      await expectNoHorizontalOverflow(page);

      await page.goto('/?article=1&ctx=today&read=unread');
      await expect(page.locator('h1').first()).toHaveText('单手操作测试文章一');

      const advance = page.getByRole('button', { name: '将本篇标为已读并打开下一篇' });
      const back = page.getByRole('button', { name: '返回列表' });
      const star = page.getByRole('button', { name: '收藏', exact: true });
      const more = page.getByRole('button', { name: '更多操作' });
      const advanceBounds = await boundsOf(advance, 'reader advance button');
      const backBounds = await boundsOf(back, 'reader back action');
      const starBounds = await boundsOf(star, 'reader star action');
      const moreBounds = await boundsOf(more, 'reader more action');

      for (const [label, bounds] of [
        ['reader advance button', advanceBounds],
        ['reader back action', backBounds],
        ['reader star action', starBounds],
        ['reader more action', moreBounds],
      ] as const) {
        expectInsideViewport(bounds, viewport, label);
        expect(centerX(bounds), `${label} should be in the left half`).toBeLessThan(viewport.width / 2);
      }
      expect(backBounds.x).toBeLessThan(starBounds.x);
      expect(starBounds.x).toBeLessThan(moreBounds.x);

      await more.click();
      const shareAction = page.getByRole('button', { name: '分享', exact: true });
      const overflowPopup = shareAction.locator('..');
      const popupBounds = await boundsOf(overflowPopup, 'reader overflow popup');
      expectInsideViewport(popupBounds, viewport, 'reader overflow popup');
      expect(popupBounds.x).toBeGreaterThanOrEqual(moreBounds.x - 1);
      expect(popupBounds.x + popupBounds.width).toBeGreaterThan(moreBounds.x + moreBounds.width);

      await page.getByRole('button', { name: '打开阅读设置', exact: true }).click();
      await expect(shareAction).toBeHidden();
      const tweaksTitle = page.getByText('阅读设置', { exact: true });
      const readerTweaksPanel = tweaksTitle.locator('..');
      const readerTweaksBounds = await boundsOf(readerTweaksPanel, 'reader tweaks panel');
      expectInsideViewport(readerTweaksBounds, viewport, 'reader tweaks panel');
      expect(centerX(readerTweaksBounds)).toBeLessThan(viewport.width / 2);

      const readerOperationSelector = readerTweaksPanel.getByRole('group', { name: '单手操作' });
      await expect(readerOperationSelector.getByRole('button', { name: '左侧', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expectNoHorizontalOverflow(page);

      await page.goto('/sources');
      const sourcesTweaks = page.getByRole('button', { name: '微调', exact: true });
      const sourcesButtonBounds = await boundsOf(sourcesTweaks, 'Sources tweaks button');
      expectInsideViewport(sourcesButtonBounds, viewport, 'Sources tweaks button');
      expect(centerX(sourcesButtonBounds)).toBeLessThan(viewport.width / 2);

      // The Next dev-only toolbar is outside production layout but can cover
      // this bottom-edge target while Playwright runs against `next dev`.
      await page.locator('nextjs-portal').evaluateAll((portals) => {
        for (const portal of portals) (portal as HTMLElement).style.display = 'none';
      });
      await sourcesTweaks.click();
      const sourcesPanel = page.locator('#sources-tweaks-panel');
      const sourcesPanelBounds = await boundsOf(sourcesPanel, 'Sources tweaks panel');
      expectInsideViewport(sourcesPanelBounds, viewport, 'Sources tweaks panel');
      expect(centerX(sourcesPanelBounds)).toBeLessThan(viewport.width / 2);
      await expect(page.getByRole('group', { name: '单手操作' })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);

      await page.reload();
      await expect.poll(() => page.evaluate(() => localStorage.getItem('xreader:operationSide'))).toBe('left');
      const reloadedSourcesBounds = await boundsOf(sourcesTweaks, 'reloaded Sources tweaks button');
      expectInsideViewport(reloadedSourcesBounds, viewport, 'reloaded Sources tweaks button');
      expect(centerX(reloadedSourcesBounds)).toBeLessThan(viewport.width / 2);
      await expectNoHorizontalOverflow(page);

      const wideViewport = { width: 900, height: 900 };
      await page.setViewportSize(wideViewport);
      const wideSourcesBounds = await boundsOf(sourcesTweaks, 'wide Sources tweaks button');
      expectInsideViewport(wideSourcesBounds, wideViewport, 'wide Sources tweaks button');
      expect(centerX(wideSourcesBounds)).toBeGreaterThan(wideViewport.width / 2);
      await expectNoHorizontalOverflow(page);

      await page.goto('/?article=1&ctx=today&read=unread');
      await expect(page.locator('h1').first()).toHaveText('单手操作测试文章一');
      const wideAdvance = page.getByRole('button', { name: '将本篇标为已读并打开下一篇' });
      const wideAdvanceBounds = await boundsOf(wideAdvance, 'wide reader advance button');
      expectInsideViewport(wideAdvanceBounds, wideViewport, 'wide reader advance button');
      expect(centerX(wideAdvanceBounds)).toBeGreaterThan(wideViewport.width / 2);
      await expectNoHorizontalOverflow(page);

      expect(unexpectedApiUrls).toEqual([]);
    });
  });
}
