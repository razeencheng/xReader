import { expect, test } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const storageState = process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/user.json';
const hasStorageState = fs.existsSync(path.resolve(storageState));

if (hasStorageState) {
  test.use({ storageState });
}

test.skip(!hasStorageState, `Missing storage state file: ${storageState}`);

test('can add a source and open the first article', async ({ page }) => {
  await page.goto('/sources');

  const feedUrl = process.env.PLAYWRIGHT_TEST_FEED_URL ?? 'https://example.com/feed.xml';
  await page.getByPlaceholder('https://example.com/feed.xml').fill(feedUrl);
  await page.getByRole('button', { name: '添加' }).click();

  await expect(page.getByText('订阅源已添加。')).toBeVisible();

  await page.goto('/');
  await expect(page.locator('article').first()).toBeVisible({ timeout: 120_000 });
  await page.locator('article').first().click();

  await expect(page.locator('h1').first()).toBeVisible();
  await expect(page.locator('article').first()).toContainText(/./);
});
