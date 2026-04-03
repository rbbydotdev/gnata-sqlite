import { test, expect } from '@playwright/test';

test.describe('SQLite cross-browser compatibility', () => {
  test('worker initializes and generates data', async ({ page }) => {
    await page.goto('/');

    // Worker should become ready
    await expect(page.locator('.status.ready')).toBeVisible({ timeout: 30000 });

    // Generate data
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.locator('.status')).toContainText('orders', { timeout: 30000 });

    // Results table should appear (auto-runs query after generate)
    await expect(page.locator('.results-table')).toBeVisible({ timeout: 10000 });
  });
});
