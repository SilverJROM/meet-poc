import { expect, test } from '@playwright/test';
import { MB2_SCREENSHOT_DIR, cleanupMb2Artifacts, createMb2Room, prepareMb2Evidence } from './helpers';

test.beforeAll(() => {
  prepareMb2Evidence();
  cleanupMb2Artifacts();
});

test.afterAll(() => {
  cleanupMb2Artifacts();
});

test('S5.2/R8.4 desktop camera preflight keeps the existing desktop constraint path', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const room = await createMb2Room(page, 'desktop-constraints');
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();

  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastVideoConstraints)).toMatchObject({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
  });
  const constraints = await page.evaluate(() => window.__meetDebug?.lastVideoConstraints);
  expect(constraints?.video).toMatchObject({
    width: { ideal: 1280 },
    height: { ideal: 720 },
  });
  expect((constraints?.video as MediaTrackConstraints).width).not.toMatchObject({ max: 854 });
  await page.screenshot({ path: `${MB2_SCREENSHOT_DIR}/desktop-720p-constraint-debug.png`, fullPage: true });
});
