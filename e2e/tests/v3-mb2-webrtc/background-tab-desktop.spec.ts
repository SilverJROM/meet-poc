import { expect, test } from '@playwright/test';
import { cleanupMb2Artifacts, createMb2Room, joinOwnerWithCamera, prepareMb2Evidence } from './helpers';

test.beforeAll(() => {
  prepareMb2Evidence();
  cleanupMb2Artifacts();
});

test.afterAll(() => {
  cleanupMb2Artifacts();
});

test('S5.5/R8.4 desktop visibility changes do not pause local video', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const room = await createMb2Room(page, 'background-desktop');
  await joinOwnerWithCamera(page, room);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(true);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(true);
});
