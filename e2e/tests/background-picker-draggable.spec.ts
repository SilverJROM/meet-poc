import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../fixtures/auth';
import { cleanupRoomsByPrefix } from '../fixtures/db';
import { createRoomViaApi, joinOwnerCall, type TestRoom } from '../fixtures/rooms';

const ROOM_PREFIX = 'BG Picker Drag';

test.beforeEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test.afterEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test('opens via wand, drags, closes, and reopens from settings', async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 720 });

  let room: TestRoom | null = null;
  try {
    room = await createRoomViaApi(request, `${ROOM_PREFIX} ${Date.now()}`);
    await loginAsJrom(page);
    await joinOwnerCall(page, room);

    await page.getByRole('button', { name: 'Background effects' }).click();

    const picker = page.locator('app-background-picker');
    const panel = picker.locator('.picker-panel');
    const header = picker.locator('.picker-header');
    await expect(panel).toBeVisible();

    const before = await panel.boundingBox();
    if (!before) throw new Error('background picker panel missing before drag');

    await header.hover();
    await page.mouse.down();
    await page.mouse.move(before.x - 140, before.y + 40, { steps: 8 });
    await page.mouse.up();

    const after = await panel.boundingBox();
    if (!after) throw new Error('background picker panel missing after drag');

    expect(Math.abs(after.x - before.x)).toBeGreaterThan(20);
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.y).toBeGreaterThanOrEqual(0);
    expect(after.x + after.width).toBeLessThanOrEqual(1280);
    expect(after.y + after.height).toBeLessThanOrEqual(720);

    await picker.getByRole('button', { name: 'Close background picker' }).click();
    await expect(picker).toHaveCount(0);

    await page.locator('app-controls-bar').getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Background effects' }).click();
    await expect(page.locator('app-background-picker .picker-panel')).toBeVisible();
  } finally {
    if (room) await request.delete(`/api/rooms/${room.id}`).catch(() => undefined);
    cleanupRoomsByPrefix(ROOM_PREFIX);
  }
});
