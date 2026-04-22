import { expect, test } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/user.json';
const hasStorageState = fs.existsSync(path.resolve(storageState));

if (hasStorageState) {
  test.use({ storageState });
}

test.skip(!hasStorageState, `Missing storage state file: ${storageState}`);

test('highlight persists after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible({ timeout: 120_000 });
  await page.locator('article').first().click();

  const paragraph = page.locator('[data-layer="original"]').first();
  await expect(paragraph).toBeVisible();

  await paragraph.evaluate((node) => {
    const textNode = Array.from(node.childNodes).find((child) => child.nodeType === Node.TEXT_NODE) as Text | undefined;
    const contentNode = textNode ?? (node.firstChild as Text | null);
    if (!contentNode) {
      throw new Error('No text node found for selection');
    }

    const text = contentNode.textContent ?? '';
    const start = Math.max(0, Math.min(2, text.length - 1));
    const end = Math.min(text.length, Math.max(start + 1, Math.min(8, text.length)));
    const range = document.createRange();
    range.setStart(contentNode, start);
    range.setEnd(contentNode, end);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });

  await page.mouse.click(100, 100);
  await expect(page.getByRole('button', { name: '高亮' })).toBeVisible();
  await page.getByRole('button', { name: '高亮' }).click();

  await expect(page.locator('mark[data-highlight-id]')).toBeVisible();
  await page.reload();
  await expect(page.locator('mark[data-highlight-id]')).toBeVisible({ timeout: 120_000 });
});
