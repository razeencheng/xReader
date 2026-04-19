import { expect, test } from 'playwright/test';

test.use({
  storageState: process.env.PLAYWRIGHT_STORAGE_STATE ?? 'playwright/.auth/user.json',
});

test('density preference persists after reload', async ({ page }) => {
  await page.goto('/');

  const compactButton = page.getByRole('button', { name: '紧凑' });
  await expect(compactButton).toBeVisible();

  await compactButton.click();
  await expect(compactButton).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(compactButton).toHaveAttribute('aria-pressed', 'true');
});
