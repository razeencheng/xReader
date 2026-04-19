import { expect, test } from 'playwright/test';

test.use({
  storageState: process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/user.json',
});

test('navigates to the next article from reader chrome', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article').nth(1)).toBeVisible({ timeout: 120_000 });

  await page.locator('article').first().click();
  await expect(page.locator('h1').first()).toBeVisible();

  const currentTitle = await page.locator('h1').first().innerText();
  const nextButton = page.getByRole('button', { name: /下一篇/ });
  await expect(nextButton).toBeVisible();
  await nextButton.click();

  await expect(page.locator('h1').first()).not.toHaveText(currentTitle, { timeout: 120_000 });
});
