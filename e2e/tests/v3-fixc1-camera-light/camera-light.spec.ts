import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXC1_PREFIX = 'FIXC1';

test.describe.configure({ mode: 'serial' });

test('FIXC1.1 join and leave stops all local media tracks', async ({ page, request }) => {
  const room = await createFixRoom(request, 'leave');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room);

  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(2);

  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'Leave but keep meeting going' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBe(0);
});

test('FIXC1.2 pagehide stops camera, mic, and active screen-share tracks', async ({ page, request }) => {
  await installFakeDisplayMedia(page);
  const room = await createFixRoom(request, 'pagehide');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.screenShareAttempts || 0)).toBe(1);
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(3);

  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBe(0);
});

test('FIXC1.3 lifecycle cleanup is idempotent', async ({ page, request }) => {
  const room = await createFixRoom(request, 'idempotent');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room);
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(2);

  const result = await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('beforeunload'));
    return 'ok';
  });

  expect(result).toBe('ok');
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBe(0);
});

test('FIXC1.4 mute disables audio without stopping the track', async ({ page, request }) => {
  const room = await createFixRoom(request, 'mute');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room);

  await expect.poll(() => audioTrackState(page), { timeout: 8000 }).toEqual({ enabled: true, readyState: 'live' });
  await page.getByRole('button', { name: 'Mute microphone' }).click();
  await expect.poll(() => audioTrackState(page), { timeout: 8000 }).toEqual({ enabled: false, readyState: 'live' });
  await expect.poll(() => liveTrackCount(page), { timeout: 8000 }).toBeGreaterThanOrEqual(2);
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXC1_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwnerWithCamera(page: Page, room: TestRoom): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await page.locator('#display-name').fill('fixc1-host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function liveTrackCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.__activeTracks || []).filter((track) => track.readyState === 'live').length);
}

async function audioTrackState(page: Page): Promise<{ enabled: boolean | undefined; readyState: MediaStreamTrackState | undefined }> {
  return page.evaluate(() => {
    const track = window.__meetDebug?.localStream?.getAudioTracks()[0];
    return { enabled: track?.enabled, readyState: track?.readyState };
  });
}

async function installFakeDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d');
        context?.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.captureStream();
      },
    });
  });
}
