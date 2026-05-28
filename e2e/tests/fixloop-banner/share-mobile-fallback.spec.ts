import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('Batch A screen share shows a graceful unsupported-browser notice', async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: undefined,
    });
  });

  const room = await createRoomFromDashboard(page, `ShareFallback ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(
    page
      .locator('.device-notice')
      .getByText("Screen sharing isn't available in this browser. Try Chrome on Android, Safari 16+ on iPhone, or join from a desktop."),
  ).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.screenShareAttempts), { timeout: 5_000 }).toBe(0);
});
