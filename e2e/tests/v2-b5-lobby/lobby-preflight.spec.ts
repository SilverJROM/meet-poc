import { expect, test } from '@playwright/test';
import { gotoOwnedLobby } from './helpers';

test('S5.1 lobby pre-grants getUserMedia on mount', async ({ page }) => {
  await gotoOwnedLobby(page);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks().length || 0)).toBeGreaterThan(0);
  await expect(page.locator('app-lobby-preview')).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-5/screenshots/lobby-camera-off-preview.png',
    fullPage: true,
  });
});
