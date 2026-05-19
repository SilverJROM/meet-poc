import { expect, test } from '@playwright/test';
import WebSocket from 'ws';
import { B6_SCREENSHOT_DIR, admitBrowserGuest, closeSocketGuests, createAndJoinOwner, openSocketGuest, admitSocketGuest, prepareB6Evidence } from './helpers';

test.beforeAll(() => {
  prepareB6Evidence();
});

test('S6.1 lays out one participant centered with a 720px cap', async ({ page }) => {
  await createAndJoinOwner(page, 'one-peer');

  const tile = page.locator('app-tile').first();
  await expect(tile).toBeVisible();
  const box = await tile.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(722);
  expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThan(24);
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/grid-1-peer-centered.png`, fullPage: true });
});

test('S6.1 lays out two participants in a split row', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'two-peer');
  const guest = await admitBrowserGuest(browser, page, room, 'guest');

  const boxes = await page.locator('app-tile').evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(2);
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(8);
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(8);
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left + 16);
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/grid-2-peer-split.png`, fullPage: true });
  await guest.context().close();
});

test('S6.1 switches from 2-column to 3-column grid at the required peer thresholds', async ({ page }) => {
  const room = await createAndJoinOwner(page, 'thresholds');
  const sockets: WebSocket[] = [];

  try {
    for (const name of ['grid-a', 'grid-b']) {
      const socket = await openSocketGuest(room, name);
      sockets.push(socket);
      await admitSocketGuest(page, socket, name);
    }
    await expect(page.locator('app-tile')).toHaveCount(3);
    await expect(page.locator('.tiles-grid')).toHaveAttribute('data-count', '3');
    await expect.poll(() => page.locator('.tiles-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(2);
    await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/grid-3-peer-2x2.png`, fullPage: true });

    for (const name of ['grid-c', 'grid-d']) {
      const socket = await openSocketGuest(room, name);
      sockets.push(socket);
      await admitSocketGuest(page, socket, name);
    }
    await expect(page.locator('app-tile')).toHaveCount(5);
    await expect(page.locator('.tiles-grid')).toHaveAttribute('data-count', '5');
    await expect.poll(() => page.locator('.tiles-grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)).toBe(3);
    await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/grid-5-peer-3x3.png`, fullPage: true });
  } finally {
    closeSocketGuests(sockets);
  }
});
