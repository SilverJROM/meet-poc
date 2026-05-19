import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.4 creates a room and shows it in the dashboard list', async ({ page }) => {
  await loginAsJrom(page);
  const title = `Team sync ${Date.now()}`;
  await page.locator('#room-title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  const row = page.locator('.room-row').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', /\/room\/[a-f0-9]{12}$/);
  await expect(row.getByRole('button', { name: /Copy link/ })).toBeVisible();
  await expect(row.getByRole('button', { name: /Delete/ })).toBeVisible();
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-3/screenshots/dashboard-with-room.png', fullPage: true });
});

test('S3.8 copy-link puts the share URL in the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loginAsJrom(page);
  const title = `Copy link ${Date.now()}`;
  await page.locator('#room-title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  const row = page.locator('.room-row').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  const expectedUrl = await row.locator('code').innerText();
  await row.getByRole('button', { name: /Copy link/ }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expectedUrl);
});
