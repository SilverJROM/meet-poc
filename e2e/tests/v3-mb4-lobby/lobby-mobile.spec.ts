import { expect, test } from '@playwright/test';
import { MB4_SCREENSHOT_DIR, cleanupMb4Artifacts, enableLobbyCamera, gotoOwnedMb4Lobby, prepareMb4Evidence } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareMb4Evidence();
  cleanupMb4Artifacts();
});

test.afterAll(() => {
  cleanupMb4Artifacts();
});

test('S3.1 mobile lobby shows camera switch and sends facingMode constraint on flip', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOwnedMb4Lobby(page, request, 'camera-switch-mobile');
  await enableLobbyCamera(page);

  const flip = page.getByRole('button', { name: 'Flip camera' });
  await expect(flip).toBeVisible();
  await page.screenshot({ path: `${MB4_SCREENSHOT_DIR}/mobile-camera-switch-button.png`, fullPage: true });

  await flip.click();
  await expect.poll(() =>
    page.evaluate(() => {
      const video = window.__meetDebug?.lastVideoConstraints?.video;
      return typeof video === 'object' && video ? (video as MediaTrackConstraints).facingMode : null;
    }),
  ).toBe('environment');
});

test('S3.3 mobile lobby device selectors stack in one column', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOwnedMb4Lobby(page, request, 'selectors-mobile');

  const mic = page.locator('.mic-select');
  const camera = page.locator('.camera-select');
  await expect(mic).toBeVisible();
  await expect(camera).toBeVisible();
  const micBox = await mic.boundingBox();
  const cameraBox = await camera.boundingBox();
  expect(micBox).not.toBeNull();
  expect(cameraBox).not.toBeNull();
  expect(micBox!.y + micBox!.height).toBeLessThan(cameraBox!.y);
  await page.screenshot({ path: `${MB4_SCREENSHOT_DIR}/mobile-selectors-single-column.png`, fullPage: true });
});

test('S3.4 mobile lobby gates AudioContext mic preview behind a user gesture', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOwnedMb4Lobby(page, request, 'audiocontext-gate');

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.audioContextActivated)).toBe(false);
  await expect(page.getByRole('button', { name: 'Tap to enable mic preview' })).toBeVisible();
  await expect(page.locator('app-mic-meter .bar.is-active')).toHaveCount(0);
  await page.screenshot({ path: `${MB4_SCREENSHOT_DIR}/mobile-lobby-with-pill.png`, fullPage: true });

  await page.getByRole('button', { name: 'Tap to enable mic preview' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.audioContextActivated)).toBe(true);
  await expect.poll(() => page.locator('app-mic-meter .bar.is-active').count(), { timeout: 2500 }).toBeGreaterThan(0);
  await page.screenshot({ path: `${MB4_SCREENSHOT_DIR}/mobile-lobby-after-tap.png`, fullPage: true });
});

test('S3.1 desktop lobby does not render the mobile camera switch', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await gotoOwnedMb4Lobby(page, request, 'camera-switch-desktop');
  await enableLobbyCamera(page);

  await expect(page.getByRole('button', { name: 'Flip camera' })).toHaveCount(0);
  await page.screenshot({ path: `${MB4_SCREENSHOT_DIR}/desktop-lobby-no-switch.png`, fullPage: true });
});
