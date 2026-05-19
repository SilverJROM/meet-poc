import { expect, test } from '@playwright/test';

test('S6.3 voice.silverjrom.app serves the Angular app', async ({ page }) => {
  await page.goto('https://voice.silverjrom.app/');
  await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-6/screenshots/voice-silverjrom-app-new.png',
    fullPage: true,
  });
});
