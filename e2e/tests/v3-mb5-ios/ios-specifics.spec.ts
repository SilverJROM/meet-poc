import { expect, test } from '@playwright/test';
import { MB5_SCREENSHOT_DIR, cleanupMb5Artifacts, createAndJoinOwner, installFakeMediaRecorder, prepareMb5Evidence, recordOnce } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareMb5Evidence();
  cleanupMb5Artifacts();
});

test.afterAll(() => {
  cleanupMb5Artifacts();
});

test('S6.2 MediaRecorder falls back to mp4 capability and uploads .mp4', async ({ page }) => {
  await installFakeMediaRecorder(page, 'audio/mp4');
  await createAndJoinOwner(page, 'mime-fallback');

  await recordOnce(page);

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastRecordingMime)).toBe('audio/mp4');
  await expect(page.evaluate(() => window.__meetDebug?.lastRecordingExtension)).resolves.toBe('mp4');
  await expect(page.evaluate(() => window.__meetDebug?.lastRecordingUpload?.file || '')).resolves.toMatch(/\.mp4$/);
});

test('S6.6 iOS MediaRecorder starts without sub-1000ms timeslice', async ({ page }) => {
  await installFakeMediaRecorder(page, 'audio/webm;codecs=opus', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
  await createAndJoinOwner(page, 'ios-timeslice');

  await page.getByRole('button', { name: 'Record' }).click();

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastRecorderTimeslice)).toBe(null);
  await expect(page.evaluate(() => window.__fakeRecorderTimeslice)).resolves.toBe(null);
  await page.getByRole('button', { name: 'Stop recording' }).click();
});

test('S6.7 mobile landscape lobby and call controls remain visible without portrait lock', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const room = await createAndJoinOwner(page, 'landscape-call');

  const controls = page.locator('app-controls-bar .controls-bar');
  await expect(controls).toBeVisible();
  const controlsBox = await controls.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${MB5_SCREENSHOT_DIR}/mobile-landscape-controls-visible.png`, fullPage: true });

  await page.goto(room.url);
  await expect(page.locator('app-lobby-preview')).toBeVisible();
  const previewBox = await page.locator('app-lobby-preview').boundingBox();
  expect(previewBox).not.toBeNull();
  expect(previewBox!.y).toBeGreaterThanOrEqual(0);
  expect(previewBox!.y + previewBox!.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${MB5_SCREENSHOT_DIR}/mobile-landscape-lobby.png`, fullPage: true });
});
