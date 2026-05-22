import { expect, test } from '@playwright/test';
import { MB2_SCREENSHOT_DIR, cleanupMb2Artifacts, createMb2Room, prepareMb2Evidence } from './helpers';

test.beforeAll(() => {
  prepareMb2Evidence();
  cleanupMb2Artifacts();
});

test.afterAll(() => {
  cleanupMb2Artifacts();
});

test('S5.1 mobile camera preflight requests 480p constraints', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createMb2Room(page, 'mobile-constraints');
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();

  await page.getByLabel('Start with camera on').check();
  const constraints = await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastVideoConstraints)).toMatchObject({
    video: {
      width: { ideal: 854, max: 854 },
      height: { ideal: 480, max: 480 },
    },
  });
  void constraints;
  const debugConstraints = await page.evaluate(() => window.__meetDebug?.lastVideoConstraints);
  expect(debugConstraints?.video).toMatchObject({
    width: { ideal: 854, max: 854 },
    height: { ideal: 480, max: 480 },
  });
  await page.screenshot({ path: `${MB2_SCREENSHOT_DIR}/mobile-480p-constraint-debug.png`, fullPage: true });
});
