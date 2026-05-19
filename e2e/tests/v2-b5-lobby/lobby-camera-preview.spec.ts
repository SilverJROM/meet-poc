import { expect, test } from '@playwright/test';
import { gotoOwnedLobby } from './helpers';

test('B5 lobby camera-on preview renders after camera checkbox', async ({ page }) => {
  await gotoOwnedLobby(page);
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await expect(page.locator('app-lobby-preview video')).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-5/screenshots/lobby-camera-on-preview.png',
    fullPage: true,
  });
});
