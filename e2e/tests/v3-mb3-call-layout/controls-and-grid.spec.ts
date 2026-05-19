import { expect, test } from '@playwright/test';
import { MB3_SCREENSHOT_DIR, admitBrowserGuest, cleanupMb3Artifacts, createAndJoinOwner, openParticipants, prepareMb3Evidence } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareMb3Evidence();
  cleanupMb3Artifacts();
});

test.afterAll(() => {
  cleanupMb3Artifacts();
});

test('S2.3 mobile controls are docked at the bottom above the safe-area gutter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAndJoinOwner(page, 'mobile-controls');

  const bar = page.locator('app-controls-bar .controls-bar');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThan(760);
  expect(Math.abs(box!.y + box!.height - 844)).toBeLessThanOrEqual(4);
  await expect(page.locator('.room-label')).toBeHidden();
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/mobile-controls-docked.png`, fullPage: true });
});

test('S2.3 desktop controls remain top mounted', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await createAndJoinOwner(page, 'desktop-controls');

  const bar = page.locator('app-controls-bar .controls-bar');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeLessThan(32);
  expect(box!.y + box!.height).toBeLessThan(120);
  await expect(page.locator('.room-label')).toBeVisible();
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/desktop-controls-top.png`, fullPage: true });
});

test('S2.4 mobile one-peer grid uses the full call area without a desktop max cap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAndJoinOwner(page, 'mobile-one-peer');

  await expect(page.locator('.tiles-grid')).toHaveAttribute('data-count', '1');
  const tile = page.locator('app-tile').first();
  await expect(tile).toBeVisible();
  const box = await tile.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(360);
  expect(box!.height).toBeGreaterThan(640);
  expect(box!.x).toBeLessThan(12);
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/mobile-grid-1peer.png`, fullPage: true });
});

test('S2.4 mobile two-peer grid stacks tiles vertically', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createAndJoinOwner(page, 'mobile-two-peer');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-a');

  await expect(page.locator('.tiles-grid')).toHaveAttribute('data-count', '2');
  const boxes = await page.locator('app-tile').evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(2);
  expect(Math.abs(boxes[0].x - boxes[1].x)).toBeLessThan(8);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(8);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 8);
  expect(boxes[0].height).toBeGreaterThan(300);
  expect(boxes[1].height).toBeGreaterThan(300);
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/mobile-grid-2peer.png`, fullPage: true });

  await guest.context().close();
});

test('S2.4 mobile three/four-peer grid uses two compact columns', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createAndJoinOwner(page, 'mobile-four-peer');
  const guestA = await admitBrowserGuest(browser, page, room, 'guest-a');
  const guestB = await admitBrowserGuest(browser, page, room, 'guest-b');
  const guestC = await admitBrowserGuest(browser, page, room, 'guest-c');

  await expect(page.locator('.tiles-grid')).toHaveAttribute('data-count', '4');
  await expect.poll(() => page.locator('.tiles-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(2);
  const boxes = await page.locator('app-tile').evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(4);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width - 8);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y + boxes[0].height - 8);

  await guestA.context().close();
  await guestB.context().close();
  await guestC.context().close();
});

test('S2.5 screen-share control is absent on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createAndJoinOwner(page, 'screen-share-mobile');
  await expect(page.getByRole('button', { name: 'Share screen' })).toHaveCount(0);
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/screen-share-hidden-mobile.png`, fullPage: true });
});

test('S2.5 screen-share control remains present on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await createAndJoinOwner(page, 'screen-share-desktop');
  await expect(page.getByRole('button', { name: 'Share screen' })).toBeVisible();
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/screen-share-visible-desktop.png`, fullPage: true });
});

test('S2.1 desktop sidebar remains a right rail with no mobile backdrop or tabs', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await createAndJoinOwner(page, 'desktop-sidebar');
  await openParticipants(page);

  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).not.toHaveClass(/mobile-mode/);
  await expect(page.locator('app-participant-sidebar .sheet-backdrop')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'In the call' })).toHaveCount(0);
  await expect.poll(async () => {
    const settled = await sidebar.boundingBox();
    return Math.round(settled?.width ?? 0);
  }).toBeGreaterThan(300);
  const box = await sidebar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThan(1200);
  expect(box!.width).toBeGreaterThan(300);
  expect(box!.height).toBeGreaterThan(700);
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/desktop-sidebar-still-right.png`, fullPage: true });
});
