import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { createRoomFromDashboard, type TestRoom } from '../../fixtures/rooms';

const DIAGC_PREFIX = 'DIAGC';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-video-weak/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('DR-42 degrades weak video before audio-only floor, recovers, and respects manual audio-only', async ({ browser, page }) => {
  await installWeakConnectionProbe(page.context());
  const room = await createRoomFromDashboard(page, `${DIAGC_PREFIX} weak link ${Date.now()}`);
  await joinOwnerWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  await installWeakConnectionProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestWithCamera(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });

  await expectSenderPreferences(page);
  await expectSenderPreferences(guest);

  await sampleQuality(page, 'poor', 3);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.diagnostics?.[0]?.quality || 'missing'), { timeout: 5000 }).toBe('poor');

  await expect(page.getByText('Weak connection - audio only')).toHaveCount(0);
  const qualityPill = page.locator('app-tile').filter({ hasText: 'guest' }).locator('.quality-pill');
  await expect(qualityPill).toHaveText('poor');
  await qualityPill.screenshot({ path: `${SCREENSHOT_DIR}/quality-pill.png` });
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderDegraded(guest), { timeout: 5000 }).toBe(true);
  await expect.poll(() => degradedEncoding(guest), { timeout: 5000 }).toEqual({
    videoMaxBitrate: 120000,
    videoScaleResolutionDownBy: 4,
    videoMaxFramerate: 8,
  });
  await expect.poll(() => audioStillActive(guest), { timeout: 5000 }).toBe(true);
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('video')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/degraded-video-still-rendered.png`, fullPage: true });

  await sampleQuality(page, 'critical', 3);
  await expect(page.getByText('Weak connection - audio only')).toBeVisible();
  await expect(qualityPill).toHaveText('audio only');
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(true);
  await expect.poll(() => audioStillActive(guest), { timeout: 5000 }).toBe(true);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/audio-only-floor-banner.png`, fullPage: true });

  await sampleQuality(page, 'good', 5);

  await expect(page.getByText('Weak connection - audio only')).toHaveCount(0);
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderDegraded(guest), { timeout: 5000 }).toBe(false);
  await expect.poll(() => restoredEncoding(guest), { timeout: 5000 }).toEqual({
    videoMaxBitrate: 700000,
    videoScaleResolutionDownBy: 1,
    videoMaxFramerate: 30,
  });
  await page.getByRole('button', { name: 'Enable audio-only mode' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.manualAudioOnly)).toBe(true);
  await expect(page.getByText('Audio-only mode is on')).toBeVisible();
  await expect.poll(() => senderPaused(page), { timeout: 5000 }).toBe(true);
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(true);
  await sampleQuality(page, 'good', 5);
  await expect.poll(() => senderPaused(page), { timeout: 3000 }).toBe(true);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/audio-only-toggle.png`, fullPage: true });

  await page.getByRole('button', { name: 'Disable audio-only mode' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.manualAudioOnly), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderPaused(page), { timeout: 5000 }).toBe(false);
  await expect.poll(() => senderPaused(guest), { timeout: 5000 }).toBe(false);

  await guestContext.close();
});

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuestWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

async function sampleQuality(page: Page, quality: 'good' | 'weak' | 'poor' | 'critical', count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((nextQuality) => window.__meetDebug?.sampleConnectionQualityForTest?.(nextQuality), quality);
  }
}

async function expectSenderPreferences(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const snapshot = window.__meetDebug?.senderSnapshot?.()[0];
          return {
            audioPriority: snapshot?.audioPriority,
            audioNetworkPriority: snapshot?.audioNetworkPriority,
            videoPriority: snapshot?.videoPriority,
            videoNetworkPriority: snapshot?.videoNetworkPriority,
            videoMaxBitrate: snapshot?.videoMaxBitrate,
          };
        }),
      { timeout: 8000 },
    )
    .toEqual({
      audioPriority: 'high',
      audioNetworkPriority: 'high',
      videoPriority: 'low',
      videoNetworkPriority: 'low',
      videoMaxBitrate: 700000,
    });
}

async function senderPaused(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0]?.videoPaused || false);
}

async function audioStillActive(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0]?.audioActive || false);
}

async function senderDegraded(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0]?.videoDegraded || false);
}

async function degradedEncoding(page: Page): Promise<{ videoMaxBitrate: number | null; videoScaleResolutionDownBy: number | null; videoMaxFramerate: number | null }> {
  return page.evaluate(() => {
    const snapshot = window.__meetDebug?.senderSnapshot?.()[0];
    return {
      videoMaxBitrate: snapshot?.videoMaxBitrate ?? null,
      videoScaleResolutionDownBy: snapshot?.videoScaleResolutionDownBy ?? null,
      videoMaxFramerate: snapshot?.videoMaxFramerate ?? null,
    };
  });
}

async function restoredEncoding(page: Page): Promise<{ videoMaxBitrate: number | null; videoScaleResolutionDownBy: number | null; videoMaxFramerate: number | null }> {
  return degradedEncoding(page);
}

async function installWeakConnectionProbe(context: BrowserContext): Promise<void> {
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
