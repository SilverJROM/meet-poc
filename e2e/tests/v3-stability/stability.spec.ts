import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const STABILITY_PREFIX = 'STABILITY';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-stability/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(STABILITY_PREFIX);
  cleanupRecordingsByPrefix(STABILITY_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(STABILITY_PREFIX);
  cleanupRecordingsByPrefix(STABILITY_PREFIX);
});

test('DR-40 terminal failed PC recreates with same participantId and preserves media policy', async ({ browser, page }) => {
  await installStabilityPeerConnectionProbe(page.context());
  const room = await createRoomFromDashboard(page, `${STABILITY_PREFIX} terminal ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  await installStabilityPeerConnectionProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-terminal');

  const before = await recoverySnapshot(page);
  expect(before?.participantId).toBeTruthy();
  const pcCountBefore = await peerConnectionCount(page);

  await page.evaluate(async () => {
    window.__stabilityPeerConnections?.[0]?.forceFailed?.();
    await window.__meetDebug?.forceTerminalRecoveryForTest?.();
  });

  await expect.poll(() => peerConnectionCount(page), { timeout: 6000 }).toBeGreaterThan(pcCountBefore);
  await page.evaluate(() => window.__stabilityPeerConnections?.at(-1)?.forceConnected?.());
  await expect.poll(() => recoverySnapshot(page).then((snapshot) => snapshot?.autoRecoveryOutcome), { timeout: 5000 }).toBe('recovered');

  const after = await recoverySnapshot(page);
  expect(after?.participantId).toBe(before!.participantId);
  const sender = await page.evaluate(() => window.__meetDebug?.senderSnapshot?.()[0] || null);
  expect(sender).toMatchObject({ audioActive: true, audioPriority: 'high', audioNetworkPriority: 'high' });
  const remoteMedia = await page.evaluate(() => window.__meetDebug?.remoteMedia?.()[0] || null);
  expect(remoteMedia).toMatchObject({ hasRemoteAudioElement: true, remoteAudioUsesPeerStream: true });

  const pcCountBeforeResumeGuard = await peerConnectionCount(page);
  await page.evaluate(async () => {
    window.__stabilityPeerConnections?.at(-1)?.forceFailed?.();
    await window.__meetDebug?.forceTerminalRecoveryForTest?.();
    const peerId = window.__meetDebug?.peers.find((peer) => !peer.name.includes('(you)'))?.id;
    if (peerId) window.__meetDebug?.markPeerReconnectingForTest?.(peerId);
  });
  await page.waitForTimeout(2200);
  expect(await peerConnectionCount(page)).toBe(pcCountBeforeResumeGuard);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/terminal-pc-recreated.png`, fullPage: true });
  await guestContext.close();
});

test('DR-40 negotiation deadlock rolls back and re-offers', async ({ browser, page }) => {
  await installStabilityPeerConnectionProbe(page.context());
  const room = await createRoomFromDashboard(page, `${STABILITY_PREFIX} glare ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  await installStabilityPeerConnectionProbe(guestContext);
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-glare');

  await page.evaluate(async () => window.__meetDebug?.forceNegotiationDeadlockForTest?.());
  await expect.poll(() => page.evaluate(() => window.__stabilityRollbackCalls || 0), { timeout: 5000 }).toBeGreaterThan(0);
  await expect.poll(() => recoverySnapshot(page).then((snapshot) => snapshot?.rollbackCount || 0), { timeout: 5000 }).toBeGreaterThan(0);

  await guestContext.close();
});

test('DR-40 signaling reconnect resyncs room state without re-admit', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${STABILITY_PREFIX} ws ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-ws');

  const before = await remotePeerByName(page, 'guest-ws');
  const attemptsBefore = await guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  const resyncBefore = await guest.evaluate(() => window.__meetDebug?.wsResyncCount || 0);

  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsResyncCount || 0), { timeout: 10000 }).toBeGreaterThan(resyncBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect(page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-ws' })).toHaveCount(0);
  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 10000 }).toBe(1);

  await guestContext.close();
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.getByRole('button', { name: 'Show participants' }).click();
  await owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText(/connected|new|connecting/, { timeout: 15_000 });
}

async function installStabilityPeerConnectionProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    window.__stabilityPeerConnections = [];
    window.__stabilityRollbackCalls = 0;
    const NativePc = window.RTCPeerConnection;
    class StabilityPeerConnection extends NativePc {
      private forcedConnectionState: RTCPeerConnectionState | null = null;
      private forcedIceConnectionState: RTCIceConnectionState | null = null;

      constructor(configuration?: RTCConfiguration) {
        super(configuration);
        window.__stabilityPeerConnections?.push(this);
      }

      get connectionState(): RTCPeerConnectionState {
        return this.forcedConnectionState ?? super.connectionState;
      }

      get iceConnectionState(): RTCIceConnectionState {
        return this.forcedIceConnectionState ?? super.iceConnectionState;
      }

      setLocalDescription(description?: RTCLocalSessionDescriptionInit): Promise<void> {
        if (description?.type === 'rollback') window.__stabilityRollbackCalls = (window.__stabilityRollbackCalls || 0) + 1;
        return super.setLocalDescription(description);
      }

      forceFailed(): void {
        this.forcedConnectionState = 'failed';
        this.forcedIceConnectionState = 'failed';
        this.dispatchEvent(new Event('connectionstatechange'));
        this.dispatchEvent(new Event('iceconnectionstatechange'));
      }

      forceConnected(): void {
        this.forcedConnectionState = 'connected';
        this.forcedIceConnectionState = 'connected';
        this.dispatchEvent(new Event('connectionstatechange'));
        this.dispatchEvent(new Event('iceconnectionstatechange'));
      }
    }
    Object.assign(StabilityPeerConnection, NativePc);
    window.RTCPeerConnection = StabilityPeerConnection;
  });
}

async function peerConnectionCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__stabilityPeerConnections?.length || 0);
}

async function recoverySnapshot(page: Page): Promise<ReturnType<NonNullable<Window['__meetDebug']>['recoverySnapshot']>[number] | null> {
  return page.evaluate(() => window.__meetDebug?.recoverySnapshot?.()[0] || null);
}

async function remotePeerByName(page: Page, name: string): Promise<{ id: string; participantId: string; reconnecting: boolean } | null> {
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === peerName);
    return peer ? { id: peer.id, participantId: peer.participantId, reconnecting: peer.reconnecting } : null;
  }, name);
}

async function remotePeerCountByParticipant(page: Page, participantId: string): Promise<number> {
  return page.evaluate((id) => window.__meetDebug?.peers.filter((peer) => peer.participantId === id && !peer.name.includes('(you)')).length || 0, participantId);
}

declare global {
  interface Window {
    __stabilityPeerConnections?: Array<
      RTCPeerConnection & {
        forceFailed?: () => void;
        forceConnected?: () => void;
      }
    >;
    __stabilityRollbackCalls?: number;
  }
}
