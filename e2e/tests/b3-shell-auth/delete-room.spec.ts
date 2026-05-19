import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.7 delete room removes it and deleted room route shows not found', async ({ page }) => {
  await loginAsJrom(page);
  const title = `Delete room ${Date.now()}`;
  await page.locator('#room-title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  const row = page.locator('.room-row').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  const url = await row.locator('code').innerText();
  page.on('dialog', (dialog) => dialog.accept());
  await row.getByRole('button', { name: /Delete/ }).click();
  await expect(page.locator('.room-row').filter({ hasText: title })).toHaveCount(0);
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-3/screenshots/room-list-after-delete.png', fullPage: true });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Room not found' })).toBeVisible();
});
