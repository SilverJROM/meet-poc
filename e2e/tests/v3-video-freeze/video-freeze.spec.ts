import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';
import { loginAsJrom } from '../../fixtures/auth';

const DR47_PREFIX = 'DR47FREEZE';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-video-freeze/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DR47_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DR47_PREFIX);
});

test('DR-47 flags sustained video freeze and reuses ICE restart recovery', async ({ browser, page, request }) => {
  test.setTimeout(60_000);
  await installDr47PeerConnectionProbe(page.context());
  const room = await createRoomViaApi(request, `${DR47_PREFIX} video frozen ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'dr47-owner');

  const guest = await admitGuest(browser, page, room, 'dr47-camera', true);
  await expect.poll(() => remotePeer(page, 'dr47-camera').then((peer) => peer?.camEnabled), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => {
    window.__dr47StatsMode = 'video-frozen';
  });
  await sampleQuality(page, 4);

  await expect.poll(() => page.evaluate(() => window.__dr47RestartIceCalls || 0), { timeout: 7_000 }).toBeGreaterThan(0);
  const diagnosticPeer = await page.evaluate(() => window.__meetDebug?.diagnosticSnapshot?.().peers.find((peer) => peer.name === 'dr47-camera') ?? null);
  expect(diagnosticPeer?.diagnosticLabels).toContain('video-frozen');
  expect(diagnosticPeer?.inboundVideo?.framesDecoded).toBe(12);
  expect(diagnosticPeer?.inboundVideo?.freezeCount).toBeGreaterThan(0);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/video-frozen-recovery.png`, fullPage: true });
  await guest.context().close();
});

test('DR-47 flags connected-but-no-inbound-media and reuses ICE restart recovery', async ({ browser, page, request }) => {
  test.setTimeout(60_000);
  await installDr47PeerConnectionProbe(page.context());
  const room = await createRoomViaApi(request, `${DR47_PREFIX} no media ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'dr47-owner');

  const cameraOnGuest = await admitGuest(browser, page, room, 'dr47-no-media', true);
  await expect.poll(() => remotePeer(page, 'dr47-no-media').then((peer) => peer?.camEnabled), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => {
    window.__dr47RestartIceCalls = 0;
    window.__dr47StatsMode = 'no-media';
  });
  await sampleQuality(page, 4);

  await expect.poll(() => page.evaluate(() => window.__dr47RestartIceCalls || 0), { timeout: 7_000 }).toBeGreaterThan(0);
  const noMediaDiagnostic = await page.evaluate(() => window.__meetDebug?.diagnosticSnapshot?.().peers.find((peer) => peer.name === 'dr47-no-media') ?? null);
  expect(noMediaDiagnostic?.diagnosticLabels).toContain('no-inbound-media');
  expect(noMediaDiagnostic?.inboundVideo?.framesDecoded).toBe(0);
  expect(noMediaDiagnostic?.inboundAudio?.packetsReceived).toBe(0);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/no-inbound-media-recovery.png`, fullPage: true });
  await cameraOnGuest.context().close();
});

test('DR-47 excludes intentional camera-off peers from media-dead recovery', async ({ browser, page, request }) => {
  test.setTimeout(60_000);
  await installDr47PeerConnectionProbe(page.context());
  const room = await createRoomViaApi(request, `${DR47_PREFIX} camera off ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'dr47-owner');

  const cameraOffGuest = await admitGuest(browser, page, room, 'dr47-camera-off', false);
  await expect.poll(() => remotePeer(page, 'dr47-camera-off').then((peer) => peer?.camEnabled), { timeout: 10_000 }).toBe(false);
  await page.evaluate(() => {
    window.__dr47RestartIceCalls = 0;
    window.__dr47StatsMode = 'no-media';
  });
  await sampleQuality(page, 4);
  expect(await page.evaluate(() => window.__dr47RestartIceCalls || 0)).toBe(0);
  const cameraOffDiagnostic = await page.evaluate(() => window.__meetDebug?.diagnosticSnapshot?.().peers.find((peer) => peer.name === 'dr47-camera-off') ?? null);
  expect(cameraOffDiagnostic?.diagnosticLabels ?? []).not.toContain('no-inbound-media');
  expect(cameraOffDiagnostic?.diagnosticLabels ?? []).not.toContain('video-frozen');
  expect(cameraOffDiagnostic?.inboundVideo?.videoExpected).toBe(false);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/camera-off-excluded.png`, fullPage: true });
  await cameraOffGuest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitGuest(browser: Browser, owner: Page, room: TestRoom, name: string, cameraOn: boolean): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  const cameraToggle = guest.locator('input[name="cameraRequested"]');
  if ((await cameraToggle.isChecked()) !== cameraOn) await cameraToggle.setChecked(cameraOn);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText('connected', { timeout: 15_000 });
  return guest;
}

async function sampleQuality(page: Page, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(() => window.__meetDebug?.sampleConnectionQualityForTest?.());
  }
}

async function remotePeer(page: Page, name: string): Promise<{ camEnabled?: boolean } | undefined> {
  return page.evaluate((peerName) => window.__meetDebug?.peers.find((peer) => peer.name === peerName), name);
}

async function installDr47PeerConnectionProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.__dr47RestartIceCalls = 0;
    window.__dr47StatsMode = 'progressing';
    const NativePc = window.RTCPeerConnection;
    class Dr47PeerConnection extends NativePc {
      private dr47AudioPackets = 0;
      private dr47VideoFrames = 12;
      private dr47FreezeCount = 0;

      restartIce(): void {
        window.__dr47RestartIceCalls = (window.__dr47RestartIceCalls || 0) + 1;
        super.restartIce();
      }

      getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
        const mode = window.__dr47StatsMode || 'progressing';
        if (mode === 'progressing') return super.getStats(selector || undefined);
        if (mode === 'video-frozen') {
          this.dr47AudioPackets += 20;
          this.dr47FreezeCount += 1;
        }
        if (mode === 'no-media') {
          this.dr47AudioPackets = 0;
          this.dr47VideoFrames = 0;
          this.dr47FreezeCount = 0;
        }
        const stats = new Map<string, any>([
          [
            'audio-in',
            {
              id: 'audio-in',
              type: 'inbound-rtp',
              kind: 'audio',
              packetsReceived: this.dr47AudioPackets,
              packetsLost: 0,
              bytesReceived: this.dr47AudioPackets * 80,
              audioLevel: mode === 'no-media' ? 0 : 0.1,
            },
          ],
          [
            'video-in',
            {
              id: 'video-in',
              type: 'inbound-rtp',
              kind: 'video',
              packetsReceived: this.dr47VideoFrames,
              packetsLost: 0,
              framesDecoded: this.dr47VideoFrames,
              framesReceived: this.dr47VideoFrames,
              freezeCount: this.dr47FreezeCount,
              totalFreezesDuration: this.dr47FreezeCount,
            },
          ],
        ]);
        return Promise.resolve(stats as RTCStatsReport);
      }
    }
    Object.assign(Dr47PeerConnection, NativePc);
    window.RTCPeerConnection = Dr47PeerConnection;
  });
}

declare global {
  interface Window {
    __dr47RestartIceCalls?: number;
    __dr47StatsMode?: 'progressing' | 'video-frozen' | 'no-media';
  }
}
