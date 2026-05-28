import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../fixtures/auth';
import { cleanupRoomsByPrefix } from '../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../fixtures/rooms';

const ROOM_PREFIX = 'B5 BG Effects';

test.describe.configure({ retries: 1 });

test.beforeEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test.afterEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test.describe('Background effects', () => {
  test('composite stream replaces raw when blur is active', async ({ page, request }) => {
    test.setTimeout(60_000);

    let room: TestRoom | null = null;
    await page.addInitScript(() => {
      localStorage.removeItem('meet-poc:bg:selected');
      localStorage.removeItem('meet-poc:bg:mobile-opt-in');
    });

    try {
      room = await createRoomViaApi(request, `${ROOM_PREFIX} ${Date.now()}`);
      await loginAsJrom(page);
      await page.goto(room.url);

      await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
      await expect(page.locator('app-lobby-preview')).toBeVisible();

      await page.locator('label.toggle-row').filter({ has: page.locator('input[name="cameraRequested"]') }).click();
      await expect(page.locator('app-lobby-preview video')).toBeVisible();
      await page.waitForFunction(() => !!window.__meetDebug?.localStream?.getVideoTracks()[0]);

      await page.locator('app-lobby-preview').getByRole('button', { name: 'Background' }).click();
      await page.locator('app-background-picker').getByRole('radio', { name: 'Blur' }).click();

      await page.waitForFunction(
        () => {
          const dbg = window.__meetDebug;
          return (
            !!dbg?.effectiveLocalStream &&
            !!dbg.localStream &&
            dbg.effectiveLocalStream !== dbg.localStream &&
            dbg.effectiveLocalStream.getVideoTracks()[0]?.readyState === 'live'
          );
        },
        null,
        { timeout: 30_000 },
      );

      const blurState = await page.evaluate(() => ({
        rawId: window.__meetDebug?.localStream?.getVideoTracks()[0]?.id ?? null,
        effectiveId: window.__meetDebug?.effectiveLocalStream?.getVideoTracks()[0]?.id ?? null,
      }));
      expect(blurState.rawId).not.toBeNull();
      expect(blurState.effectiveId).not.toBeNull();
      expect(blurState.effectiveId).not.toBe(blurState.rawId);

      await page.locator('app-background-picker').getByRole('radio', { name: 'None' }).click();
      await page.waitForFunction(
        () => {
          const dbg = window.__meetDebug;
          return !!dbg?.effectiveLocalStream && dbg.effectiveLocalStream === dbg.localStream;
        },
        null,
        { timeout: 5_000 },
      );
    } finally {
      if (room) {
        await request.delete(`/api/rooms/${room.id}`).catch(() => undefined);
      }
      cleanupRoomsByPrefix(ROOM_PREFIX);
    }
  });
});
