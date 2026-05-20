import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S5.1 record starts and shows the recording indicator', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `Recording start ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  await page.getByRole('button', { name: 'Record' }).click();

  await expect(page.locator('.recording-indicator')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isRecording)).toBe(true);
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-5/screenshots/recording-indicator.png', fullPage: true });
});
