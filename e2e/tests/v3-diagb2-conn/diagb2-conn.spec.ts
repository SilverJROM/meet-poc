import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const DIAGB2_PREFIX = 'DIAGB2';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagb2/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('DR-1 screen-share permission denial shows the macOS helper', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGB2_PREFIX} screen helper ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  await page.evaluate(() => {
    const mediaDevices = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...mediaDevices,
        getDisplayMedia: async () => {
          throw new DOMException('Permission denied by system Screen Recording setting', 'NotAllowedError');
        },
      },
    });
  });

  await page.getByRole('button', { name: 'Share screen' }).click();

  await expect(page.getByLabel('Screen share permission help')).toBeVisible();
  await expect(page.getByText('Enable Screen Recording for Chrome in System Settings')).toBeVisible();
  await expect(page.getByText(/Cmd\+Q/)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screen-share-helper.png`, fullPage: true });
});

test('DR-2 diagnostics panel lists peer states and force-relay recreates peer connections with relay policy', async ({ browser, page }) => {
  await installPeerConnectionProbe(page.context(), 'relay');
  const room = await createRoomFromDashboard(page, `${DIAGB2_PREFIX} diagnostics ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  await installPeerConnectionProbe(guestContext, 'relay');
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });

  await page.getByRole('button', { name: 'Show connection diagnostics' }).click();
  const diagnostics = page.getByRole('region', { name: 'Connection diagnostics' });
  await expect(diagnostics).toBeVisible();
  await expect(page.locator('.diagnostic-peer').filter({ hasText: 'guest' })).toContainText('Connection');
  await expect(page.locator('.diagnostic-peer').filter({ hasText: 'guest' })).toContainText('ICE');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.forceRelay)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__diagPeerConfigs?.some((config) => config.iceTransportPolicy === 'relay') || false)).toBe(false);

  await diagnostics.getByLabel('Force relay').check();

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.forceRelay), { timeout: 5000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('meet-poc.forceRelay'))).toBe('1');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.lastPeerConnectionPolicy)).toBe('relay');
  await expect.poll(() => page.evaluate(() => window.__diagPeerConfigs?.some((config) => config.iceTransportPolicy === 'relay') || false), {
    timeout: 8000,
  }).toBe(true);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/diagnostics-panel.png`, fullPage: true });

  await guestContext.close();
});

test('DR-3 reconnect resync keeps owner and admitted guest in-call without stale local peers', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGB2_PREFIX} reconnect ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-reconnect');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-reconnect' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);

  const oldOwnerId = await page.evaluate(() => window.__meetDebug?.myClientId || '');
  await page.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsConnected), { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState)).toBe('in-call');
  await expect.poll(() => page.evaluate((id) => window.__meetDebug?.myClientId !== id, oldOwnerId), { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.filter((peer) => peer.name.includes('(you)')).length || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.some((peer) => peer.name === 'guest-reconnect') || false)).toBe(true);

  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(0);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.peers.some((peer) => peer.name === 'host') || false)).toBe(true);

  await guestContext.close();
});

async function installPeerConnectionProbe(context: BrowserContext, candidateType: 'host' | 'srflx' | 'relay'): Promise<void> {
  await context.addInitScript((type) => {
    window.__diagPeerConfigs = [];
    const NativePc = window.RTCPeerConnection;
    class ProbedPeerConnection extends NativePc {
      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        window.__diagPeerConfigs?.push(configuration || {});
      }

      getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
        const stats = new Map<string, any>([
          ['transport', { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }],
          ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote', selected: true }],
          ['local', { id: 'local', type: 'local-candidate', candidateType: type }],
        ]);
        return Promise.resolve(stats as RTCStatsReport);
      }
    }
    Object.assign(ProbedPeerConnection, NativePc);
    window.RTCPeerConnection = ProbedPeerConnection;
  }, candidateType);
}

declare global {
  interface Window {
    __diagPeerConfigs?: RTCConfiguration[];
  }
}
