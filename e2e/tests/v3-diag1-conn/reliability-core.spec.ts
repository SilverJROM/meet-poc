import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diag1/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('DIAG1-A.1 fetches ICE config and uses it for peer connections', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `DIAG1 ice config ${Date.now()}`);
  const ownerProbe = await installPeerConnectionProbe(page.context());
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guestProbe = await installPeerConnectionProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();

  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });
  await expect.poll(() => ownerProbe.hits() + guestProbe.hits()).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__diagPeerConfigs?.some((config) => config.iceServers?.length >= 2) || false)).toBe(true);

  await guestContext.close();
});

test('DIAG1-A.2 failed ICE state calls restartIce, renegotiates, and logs selected candidate type', async ({ browser, page }) => {
  const consoleLines: string[] = [];
  page.on('console', (msg) => consoleLines.push(msg.text()));
  await installPeerConnectionProbe(page.context(), { candidateType: 'relay' });
  const room = await createRoomFromDashboard(page, `DIAG1 ice restart ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  await installPeerConnectionProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });

  await page.evaluate(() => window.__diagPeerConnections?.[0]?.forceFailed());

  await expect.poll(() => page.evaluate(() => window.__diagRestartIceCalls || 0), { timeout: 7000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__diagCreateOfferOptions?.some((options) => options?.iceRestart === true) || false)).toBe(true);
  await expect.poll(() => consoleLines.some((line) => line.includes('selectedCandidateType=relay')), { timeout: 5000 }).toBe(true);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/batch-a-call-connected.png`, fullPage: true });
  await guestContext.close();
});

async function installPeerConnectionProbe(context: BrowserContext, options: { candidateType?: 'host' | 'srflx' | 'relay' } = {}): Promise<{ hits: () => number }> {
  let iceConfigHits = 0;
  await context.route('**/api/ice-config', async (route) => {
    iceConfigHits += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ iceServers: [{ urls: 'stun:test.invalid:19302' }, { urls: 'turn:test.invalid:3478', username: 'u', credential: 'c' }] }),
    });
  });
  await context.addInitScript(({ candidateType }) => {
    window.__diagPeerConfigs = [];
    window.__diagPeerConnections = [];
    window.__diagRestartIceCalls = 0;
    window.__diagCreateOfferOptions = [];
    const NativePc = window.RTCPeerConnection;
    class ProbedPeerConnection extends NativePc {
      private forcedState: RTCPeerConnectionState | null = null;

      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        window.__diagPeerConfigs?.push(configuration || {});
        window.__diagPeerConnections?.push(this);
      }

      get connectionState(): RTCPeerConnectionState {
        return this.forcedState ?? super.connectionState;
      }

      get iceConnectionState(): RTCIceConnectionState {
        return (this.forcedState as RTCIceConnectionState | null) ?? super.iceConnectionState;
      }

      restartIce(): void {
        window.__diagRestartIceCalls = (window.__diagRestartIceCalls || 0) + 1;
        super.restartIce();
      }

      createOffer(offerOptions?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
        window.__diagCreateOfferOptions?.push(offerOptions || null);
        return super.createOffer(offerOptions);
      }

      getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport> {
        if (!candidateType) return super.getStats(selector || undefined);
        const stats = new Map<string, any>([
          ['transport', { id: 'transport', type: 'transport', selectedCandidatePairId: 'pair' }],
          ['pair', { id: 'pair', type: 'candidate-pair', localCandidateId: 'local', remoteCandidateId: 'remote', selected: true }],
          ['local', { id: 'local', type: 'local-candidate', candidateType }],
        ]);
        return Promise.resolve(stats as RTCStatsReport);
      }

      forceFailed(): void {
        this.forcedState = 'failed';
        this.dispatchEvent(new Event('connectionstatechange'));
        this.dispatchEvent(new Event('iceconnectionstatechange'));
      }
    }
    Object.assign(ProbedPeerConnection, NativePc);
    window.RTCPeerConnection = ProbedPeerConnection;
  }, options);
  return { hits: () => iceConfigHits };
}

declare global {
  interface Window {
    __diagPeerConfigs?: RTCConfiguration[];
    __diagPeerConnections?: Array<RTCPeerConnection & { forceFailed?: () => void }>;
    __diagRestartIceCalls?: number;
    __diagCreateOfferOptions?: Array<RTCOfferOptions | null>;
  }
}
