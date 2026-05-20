import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S4.5 mute, camera, and screen-share controls update media state', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        return canvas.captureStream();
      },
    });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: originalGetUserMedia,
    });
  });
  const room = await createRoomFromDashboard(page, `Controls ${Date.now()}`);
  await joinOwnerCall(page, room);

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(true);
  await page.getByRole('button', { name: 'Mute' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(false);
  await page.getByRole('button', { name: 'Unmute' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(true);

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(false);
  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(true);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.screenShareAttempts)).toBe(1);
});
