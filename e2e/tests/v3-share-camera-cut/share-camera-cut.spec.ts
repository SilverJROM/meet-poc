import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const SHARE_CUT_PREFIX = 'SHARECUT53';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-share-camera-cut/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(SHARE_CUT_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(SHARE_CUT_PREFIX);
});

test('DR-53 suppresses participant cameras during screen share, keeps share/audio, restores, and allows manual camera override', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await installSenderProbe(page.context());
  await installFakeDisplayMedia(page);
  const room = await createRoomViaApi(request, `${SHARE_CUT_PREFIX} share camera cut ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  await installSenderProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestWithCamera(guest, room, 'guest');
  await admit(page, 'guest');
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 15_000 });

  const hostIdOnGuest = await expectPeerId(guest, 'host');
  const guestIdOnHost = await expectPeerId(page, 'guest');
  await expect.poll(() => senderFor(guest, hostIdOnGuest), { timeout: 10_000 }).toMatchObject({ videoPaused: false, audioActive: true });

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect(page.locator('.share-stage app-tile video')).toBeVisible();
  await expect(page.locator('.share-strip app-tile').filter({ hasText: 'host (you)' }).locator('.camera-off-avatar')).toBeVisible();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.camera-off-avatar')).toBeVisible();
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.anyScreenShareActive)).toBe(true);
  await expect.poll(() => senderFor(guest, hostIdOnGuest), { timeout: 10_000 }).toMatchObject({
    videoPaused: true,
    audioActive: true,
    videoActive: false,
  });
  await expect.poll(() => senderFor(page, guestIdOnHost), { timeout: 10_000 }).toMatchObject({
    videoPaused: false,
    audioActive: true,
    videoActive: true,
  });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/share-cameras-suppressed.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareCameraManualOverride), { timeout: 5_000 }).toBe(true);
  await expect.poll(() => senderFor(guest, hostIdOnGuest), { timeout: 10_000 }).toMatchObject({
    videoPaused: false,
    audioActive: true,
    videoActive: true,
  });

  await page.getByRole('button', { name: 'Stop sharing screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toHaveCount(0);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.anyScreenShareActive), { timeout: 10_000 }).toBe(false);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.effectiveCameraOn), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => senderFor(guest, hostIdOnGuest), { timeout: 10_000 }).toMatchObject({
    videoPaused: false,
    audioActive: true,
    videoActive: true,
  });

  await guestContext.close();
});

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuestWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

async function admit(owner: Page, name: string): Promise<void> {
  const sidebar = owner.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
}

async function expectPeerId(page: Page, name: string): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate((peerName) => {
          const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
          return peer?.id ?? null;
        }, name),
      { timeout: 10_000 },
    )
    .not.toBeNull();
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
    if (!peer?.id) throw new Error(`missing peer ${peerName}`);
    return peer.id;
  }, name);
}

async function senderFor(page: Page, peerId: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((id) => window.__meetDebug?.senderSnapshot?.().find((item) => item.id === id) ?? null, peerId);
}

async function installFakeDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#e5f0ff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1e3a8a';
          context.font = '72px sans-serif';
          context.fillText('Shared screen', 80, 140);
          context.fillStyle = '#ffffff';
          context.fillRect(80, 210, 1120, 360);
        }
        return canvas.captureStream();
      },
    });
  });
}

async function installSenderProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeGetParameters = RTCRtpSender.prototype.getParameters;
    RTCRtpSender.prototype.getParameters = function getParameters(): RTCRtpSendParameters {
      const sender = this as RTCRtpSender & { __diagParams?: RTCRtpSendParameters };
      const params = sender.__diagParams || nativeGetParameters.call(this);
      const clone = JSON.parse(JSON.stringify(params || {})) as RTCRtpSendParameters;
      if (!clone.encodings?.length) clone.encodings = [{}];
      return clone;
    };
    RTCRtpSender.prototype.setParameters = function setParameters(params: RTCRtpSendParameters): Promise<void> {
      const sender = this as RTCRtpSender & { __diagParams?: RTCRtpSendParameters };
      sender.__diagParams = JSON.parse(JSON.stringify(params));
      return Promise.resolve();
    };
  });
}
