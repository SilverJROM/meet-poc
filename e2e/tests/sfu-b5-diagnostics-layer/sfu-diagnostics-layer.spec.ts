import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { email, initialPassword } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi } from '../../fixtures/rooms';

const B5_PREFIX = 'SFUB5DIAG';
const SCREENSHOT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-B5/screenshots';

async function loginAsJromExact(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

test.setTimeout(60_000);

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(B5_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B5_PREFIX);
});

test('B5: diagnostics page surfaces per-layer fields and advertised-not-subscribed', async ({ page, request }) => {
  await loginAsJromExact(page);
  const room = await createRoomViaApi(request, `${B5_PREFIX} ${Date.now()}`);

  await page.goto(room.url);
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('#display-name').fill('b5-host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  const ids = await page.evaluate(() => {
    const debug = (window as unknown as { __meetDebug?: { myClientId?: string; myParticipantId?: string } }).__meetDebug;
    return {
      clientId: debug?.myClientId ?? '',
      participantId: debug?.myParticipantId ?? '',
      clientKey: sessionStorage.getItem('meet-poc.clientKey') ?? '',
    };
  });
  expect(ids.clientId).toBeTruthy();
  expect(ids.participantId).toBeTruthy();
  expect(ids.clientKey).toBeTruthy();

  const activeResponse = await page.request.get('/api/meeting-sessions?status=active');
  expect(activeResponse.ok()).toBeTruthy();
  const activeBody = (await activeResponse.json()) as { sessions: Array<{ id: string; roomTitle: string }> };
  const sessionId = activeBody.sessions.find((session) => session.roomTitle === room.title)?.id;
  expect(sessionId).toBeTruthy();

  const posted = await page.request.post(`/api/meeting-sessions/${sessionId}/diagnostics`, {
    data: {
      kind: 'error',
      roomId: room.id,
      roomTitle: room.title,
      clientId: ids.clientId,
      participantId: ids.participantId,
      clientKey: ids.clientKey,
      clientName: 'b5-host',
      createdAt: Date.now(),
      wsStatus: 'connected',
      wsReconnectAttempts: 0,
      wsHealth: { status: 'connected', disconnectCount: 0, reconnectAttempts: 0, cycles: [] },
      forceRelay: false,
      manualAudioOnly: false,
      lastGumError: null,
      peers: [
        {
          id: 'bob',
          name: 'Bob',
          advertisedAudioTrackNames: ['bob-audio'],
          advertisedSubscribed: false,
          isLocal: false,
          isHost: false,
          connectionState: 'advertised',
          iceConnectionState: 'n/a',
          iceGatheringState: 'n/a',
          signalingState: 'n/a',
          selectedCandidateType: null,
          relayUsed: false,
          quality: 'advertised-not-subscribed',
          packetLossPct: null,
          jitterMs: null,
          rttMs: null,
          availableOutgoingBitrateKbps: null,
          audioOnlyReason: null,
          micEnabled: true,
          camEnabled: false,
          screenOn: false,
          outboundAudio: { id: '', kind: 'audio', deviceId: null, label: null, enabled: false, muted: false, readyState: null, source: 'none' },
          inboundAudio: {
            packetsReceived: 0,
            packetsLost: 0,
            bytesReceived: 0,
            audioLevel: null,
            packetsReceivedDelta: null,
            packetsActivelyArriving: false,
            trackReadyState: null,
            trackMuted: null,
          },
          outboundVideo: { id: '', kind: 'video', deviceId: null, label: null, enabled: false, muted: false, readyState: null, source: 'none' },
          updatedAt: Date.now(),
        },
      ],
      layerDiagnostics: {
        device: { lastGumError: null },
        publish: {
          cfSessionId: 'local-cf',
          status: 'published',
          error: null,
          publishRecoveryFailed: false,
        },
        subscribe: {
          recordedAtMs: Date.now(),
          operation: 'subscribe',
          endpoint: 'POST /api/sfu/tracks',
          httpStatus: 406,
          errorCode: 'session_not_found',
          errorDescription: 'session_not_found',
          localCfSessionId: 'local-cf',
          remoteCfSessionId: 'bob-cf',
          publisherClientId: 'bob',
          publisherParticipantId: 'p-bob',
          trackNames: ['bob-audio'],
          pcSignalingState: 'have-local-offer',
          message: 'session_not_found',
        },
        recovery: {
          lastRecoveryEvent: {
            rung: 'subscribe-retry',
            publisherClientId: 'bob',
            epoch: 2,
            attempt: 1,
            atMs: Date.now(),
          },
          sfuRejoinThrottled: false,
        },
        playout: null,
        remoteInbound: [],
        advertisedNotSubscribed: [
          {
            publisherClientId: 'bob',
            name: 'Bob',
            advertisedAudioTrackNames: ['bob-audio'],
            actionHint:
              'Publisher advertised audio but SFU subscribe is not bound — inspect subscribe layer for /api/sfu/tracks HTTP errors and recovery rung.',
          },
        ],
      },
    },
  });
  expect(posted.ok(), `diagnostics post failed: ${posted.status()} ${await posted.text()}`).toBeTruthy();

  await page.goto('/app/diagnostics');
  await expect(page.getByRole('heading', { name: 'Call diagnostics', level: 2 })).toBeVisible();
  const sessionButton = page.getByRole('button', { name: new RegExp(room.title) });
  await expect(sessionButton).toBeVisible({ timeout: 10_000 });
  await sessionButton.click();

  await expect(page.getByLabel('Layer diagnostics')).toBeVisible();
  await expect(page.getByText('Subscribe').first()).toBeVisible();
  await expect(page.getByText(/HTTP 406/).first()).toBeVisible();
  await expect(page.getByLabel('Advertised not subscribed')).toBeVisible();
  await expect(page.getByText('Bob').first()).toBeVisible();
  await expect(page.getByText('bob-audio').first()).toBeVisible();

  await page.screenshot({
    path: path.resolve(process.cwd(), SCREENSHOT_DIR, 'b5-layer-diagnostics-advertised-not-subscribed.png'),
    fullPage: true,
  });
});