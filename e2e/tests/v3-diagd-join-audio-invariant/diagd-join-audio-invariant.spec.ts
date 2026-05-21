import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const DIAGD_PREFIX = 'DIAGD';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagd/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGD_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGD_PREFIX);
});

test('DR-12 join button stays clickable and names missing name only', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} name ${Date.now()}`);
  await page.goto(room.url);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks().length || 0), { timeout: 8000 }).toBeGreaterThan(0);

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please add your name');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-name.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toHaveCount(0);
});

test('DR-12 blocked microphone names mic only even when camera is requested', async ({ page, request }) => {
  await blockMicrophone(page.context());
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} mic ${Date.now()}`);
  await page.goto(room.url);
  await page.locator('#display-name').fill('mic-blocked');
  await page.locator('input[name="cameraRequested"]').check({ force: true });

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please enable your microphone');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-mic.png`, fullPage: true });
  await page.getByRole('button', { name: 'Dismiss join requirements' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toHaveCount(0);
});

test('DR-12 missing name and mic names both prerequisites', async ({ page, request }) => {
  await blockMicrophone(page.context());
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} both ${Date.now()}`);
  await page.goto(room.url);

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please add your name and enable your microphone');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-both.png`, fullPage: true });
});

test('DR-12 satisfied prerequisites join even when the user starts muted', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} muted ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url);
  await page.locator('#display-name').fill('host-muted');
  await page.locator('input[name="microphoneRequested"]').uncheck({ force: true });

  const joinButton = page.getByRole('button', { name: 'Join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.locator('.call-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled), { timeout: 5000 }).toBe(false);
});

test('DR-13 audio reservation survives degrade, restore, and video active toggles', async ({ browser, page, request }) => {
  await installSenderParameterProbe(page.context());
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} invariant ${Date.now()}`);
  await joinOwnerWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  await installSenderParameterProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestWithCamera(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });

  await expectSenderInvariant(page);
  await expectSenderInvariant(guest);

  await sampleQuality(page, 'poor', 3);
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderDegraded(guest), { timeout: 5000 }).toBe(true);
  await expectSenderInvariant(page);
  await expectSenderInvariant(guest, {
    videoMaxBitrate: 120000,
    videoScaleResolutionDownBy: 4,
    videoMaxFramerate: 8,
  });

  await sampleQuality(page, 'good', 5);
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderDegraded(guest), { timeout: 5000 }).toBe(false);
  await expectSenderInvariant(page);
  await expectSenderInvariant(guest);

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled), { timeout: 5000 }).toBe(false);
  await expectSenderInvariant(page);

  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled), { timeout: 8000 }).toBe(true);
  await expectSenderInvariant(page);

  await guestContext.close();
});

async function blockMicrophone(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...original,
        enumerateDevices: async () => [
          { deviceId: 'blocked-mic', groupId: 'blocked', kind: 'audioinput', label: 'Blocked microphone', toJSON: () => ({}) },
          { deviceId: 'camera', groupId: 'camera', kind: 'videoinput', label: 'Camera', toJSON: () => ({}) },
        ],
        getUserMedia: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
      },
    });
  });
}

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await loginAsJrom(page);
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

async function sampleQuality(page: Page, quality: 'good' | 'weak' | 'poor', count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((nextQuality) => window.__meetDebug?.sampleConnectionQualityForTest?.(nextQuality), quality);
  }
}

async function senderPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0]?.videoPaused || false);
}

async function senderDegraded(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0]?.videoDegraded || false);
}

async function expectSenderInvariant(
  page: Page,
  expectedVideo: { videoMaxBitrate: number; videoScaleResolutionDownBy: number; videoMaxFramerate: number } = {
    videoMaxBitrate: 700000,
    videoScaleResolutionDownBy: 1,
    videoMaxFramerate: 30,
  },
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const snapshot = window.__meetDebug?.senderSnapshot?.()[0];
          return {
            audioActive: snapshot?.audioActive,
            audioPriority: snapshot?.audioPriority,
            audioNetworkPriority: snapshot?.audioNetworkPriority,
            videoPriority: snapshot?.videoPriority,
            videoNetworkPriority: snapshot?.videoNetworkPriority,
            videoMaxBitrate: snapshot?.videoMaxBitrate,
            videoScaleResolutionDownBy: snapshot?.videoScaleResolutionDownBy,
            videoMaxFramerate: snapshot?.videoMaxFramerate,
          };
        }),
      { timeout: 8000 },
    )
    .toEqual({
      audioActive: true,
      audioPriority: 'high',
      audioNetworkPriority: 'high',
      videoPriority: 'low',
      videoNetworkPriority: 'low',
      ...expectedVideo,
    });
}

async function installSenderParameterProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeGetParameters = RTCRtpSender.prototype.getParameters;
    RTCRtpSender.prototype.getParameters = function getParameters(): RTCRtpSendParameters {
      const sender = this as RTCRtpSender & { __diagdParams?: RTCRtpSendParameters };
      const params = sender.__diagdParams || nativeGetParameters.call(this);
      const clone = JSON.parse(JSON.stringify(params || {})) as RTCRtpSendParameters;
      if (!clone.encodings?.length) clone.encodings = [{}];
      return clone;
    };
    RTCRtpSender.prototype.setParameters = function setParameters(params: RTCRtpSendParameters): Promise<void> {
      const sender = this as RTCRtpSender & { __diagdParams?: RTCRtpSendParameters };
      sender.__diagdParams = JSON.parse(JSON.stringify(params));
      return Promise.resolve();
    };
  });
}
