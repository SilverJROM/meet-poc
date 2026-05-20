import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXC2_PREFIX = 'FIXC2';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc2/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('FIXC2.1 pre-join device modal renders before media setup', async ({ page, request }) => {
  const room = await createFixRoom(request, 'permission');
  await loginAsJrom(page);
  await page.goto(`/join/${room.id}?manualDeviceSetup=1`);

  await expect(page.getByTestId('permission-prep')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect.poll(() => liveTrackCount(page)).toBe(0);
});

test('FIXC2.2 preview, mic meter, speaker test, and persistence work in lobby', async ({ page, request }) => {
  const room = await createFixRoom(request, 'lobby');
  await loginAsJrom(page);
  await page.goto(`/join/${room.id}?manualDeviceSetup=1`);

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Start with camera on').check();
  await expect(page.locator('app-device-dialog video')).toBeVisible();
  await expect.poll(() => previewVideoSize(page), { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(() => vuFillWidth(page), { timeout: 8000 }).toBeGreaterThan(0);

  const micValue = await page.locator('app-device-dialog .mic-select').inputValue();
  await page.locator('app-device-dialog .mic-select').selectOption(micValue);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('meet-poc.device.audioInput') || '')).toBe(micValue);

  await page.getByRole('button', { name: 'Test speaker' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.speakerTestCount || 0), { timeout: 3000 }).toBeGreaterThan(0);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/lobby-modal.png`, fullPage: true });

  await page.goto(`/join/${room.id}`);
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expect.poll(() => page.locator('app-device-dialog .mic-select').inputValue(), { timeout: 8000 }).toBe(micValue);
});

test('FIXC2.3 in-call gear opens the reused device dialog', async ({ page, request }) => {
  const room = await createFixRoom(request, 'in-call-dialog');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  await page.getByRole('button', { name: 'Device settings' }).click();
  await expect(page.locator('.modal-presentation .device-dialog').filter({ hasText: 'In-call devices' })).toBeVisible();
  await expect(page.locator('.modal-presentation .speaker-select')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/in-call-dialog.png`, fullPage: true });
});

test('FIXC2.4 mic swap preserves peer connection and replaces the sender track', async ({ browser, page, request }) => {
  const room = await createFixRoom(request, 'hot-swap');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest');
  await assertConnected(page);
  await assertConnected(guest);

  await page.getByRole('button', { name: 'Device settings' }).click();
  const beforeTrackId = await page.evaluate(() => window.__meetDebug?.localAudioTrackId || '');
  const currentMic = await page.locator('app-device-dialog .mic-select').inputValue();
  await page.locator('app-device-dialog .mic-select').selectOption(currentMic);

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localAudioTrackId || ''), { timeout: 8000 }).not.toBe(beforeTrackId);
  await assertConnected(page);
  await assertConnected(guest);
  await guestContext.close();
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXC2_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0), { timeout: 8000 }).toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuestAndAdmit(host: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText('Asking the host to admit you...')).toBeVisible();
  await host.getByRole('button', { name: 'Show participants' }).click();
  const row = host.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
}

async function assertConnected(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peerConnectionStates?.().map((peer) => peer.state) || []), { timeout: 12000 }).toContain(
    'connected',
  );
}

async function liveTrackCount(page: Page): Promise<number> {
  return page.evaluate(() => (window.__activeTracks || []).filter((track) => track.readyState === 'live').length);
}

async function previewVideoSize(page: Page): Promise<number> {
  return page.locator('app-device-dialog video').evaluate((video) => (video instanceof HTMLVideoElement ? video.videoWidth * video.videoHeight : 0));
}

async function vuFillWidth(page: Page): Promise<number> {
  return page.locator('app-device-dialog .vu-fill').evaluate((element) => element.getBoundingClientRect().width);
}
