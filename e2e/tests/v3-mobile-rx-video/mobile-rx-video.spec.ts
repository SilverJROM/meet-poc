import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const MOBILE_RX_PREFIX = 'MOBILERX51';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-mobile-rx-video/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(MOBILE_RX_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(MOBILE_RX_PREFIX);
});

test('DR-51/DR-52 mobile receives degraded video, culls non-speaker video under strain, and keeps all audio active', async ({ browser, page, request }) => {
  test.setTimeout(90_000);
  await installSenderProbe(page.context());
  const room = await createRoomViaApi(request, `${MOBILE_RX_PREFIX} rx video ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await installSenderProbe(mobileContext);
  const mobile = await mobileContext.newPage();
  await joinGuestWithCamera(mobile, room, 'phone');
  await admit(page, 'phone');
  await expect(mobile.locator('.call-panel')).toBeVisible();

  const mobileId = await expectPeerId(mobile, 'phone (you)');
  await expect.poll(() => senderFor(page, mobileId), { timeout: 10_000 }).toMatchObject({
    remoteIsMobile: true,
    videoPaused: false,
    videoDegraded: true,
    audioActive: true,
    videoMaxBitrate: 120000,
    videoScaleResolutionDownBy: 4,
    videoMaxFramerate: 8,
  });

  const speaker = await joinDesktopGuest(browser, page, room, 'speaker');
  const speakerId = await expectPeerId(mobile, 'speaker');
  await expect.poll(() => senderFor(speaker, mobileId), { timeout: 10_000 }).toMatchObject({
    remoteIsMobile: true,
    videoPaused: false,
    videoDegraded: true,
    audioActive: true,
  });

  await mobile.evaluate((id) => window.__meetDebug?.forceActiveSpeakerForTest?.(id), speakerId);
  await sampleQuality(mobile, 'poor', 3);

  await expect.poll(() => senderFor(speaker, mobileId), { timeout: 10_000 }).toMatchObject({
    videoPaused: false,
    audioActive: true,
  });
  await expect.poll(() => senderFor(page, mobileId), { timeout: 10_000 }).toMatchObject({
    videoPaused: true,
    audioActive: true,
  });
  await mobile.screenshot({ path: `${SCREENSHOT_DIR}/mobile-non-speaker-video-culled.png`, fullPage: true });

  await sampleQuality(mobile, 'good', 5);
  await expect.poll(() => senderFor(page, mobileId), { timeout: 10_000 }).toMatchObject({
    videoPaused: false,
    videoDegraded: true,
    audioActive: true,
  });

  await speaker.context().close();
  await mobileContext.close();
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

async function joinDesktopGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  await installSenderProbe(context);
  const guest = await context.newPage();
  await joinGuestWithCamera(guest, room, name);
  await admit(owner, name);
  await expect(guest.locator('.call-panel')).toBeVisible();
  return guest;
}

async function admit(owner: Page, name: string): Promise<void> {
  const sidebar = owner.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
}

async function expectPeerId(page: Page, name: string): Promise<string> {
  return expect
    .poll(
      () =>
        page.evaluate((peerName) => {
          const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
          return peer?.id ?? null;
        }, name),
      { timeout: 10_000 },
    )
    .not.toBeNull()
    .then(() =>
      page.evaluate((peerName) => {
        const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
        if (!peer?.id) throw new Error(`missing peer ${peerName}`);
        return peer.id;
      }, name),
    );
}

async function sampleQuality(page: Page, quality: 'good' | 'poor', count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate((nextQuality) => window.__meetDebug?.sampleConnectionQualityForTest?.(nextQuality), quality);
  }
}

async function senderFor(page: Page, peerId: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((id) => window.__meetDebug?.senderSnapshot?.().find((item) => item.id === id) ?? null, peerId);
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
