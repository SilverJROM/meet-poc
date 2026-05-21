import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, joinGuestAndWait, type TestRoom } from '../../fixtures/rooms';

const MIC_LIVENESS_PREFIX = 'MICLIVE35';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-mic-liveness/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(MIC_LIVENESS_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(MIC_LIVENESS_PREFIX);
});

test('DR-35 persists outbound mic liveness without alarming on flowing fake audio', async ({ browser, page, request }) => {
  await installFlowingMedia(page, 'host');
  const room = await createRoomViaApi(request, `${MIC_LIVENESS_PREFIX} mic liveness ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guest = await admitGuest(browser, page, room);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-miclive' }).locator('.state')).toHaveText('connected', { timeout: 12_000 });

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          await window.__meetDebug?.sampleConnectionQualityForTest?.();
          const snapshot = window.__meetDebug?.diagnosticSnapshot?.();
          return {
            hasLevel: Object.hasOwn(snapshot ?? {}, 'outboundAudioLevel'),
            hasEnergy: Object.hasOwn(snapshot ?? {}, 'outboundAudioEnergy'),
            hasSilent: Object.hasOwn(snapshot ?? {}, 'micSilent'),
            silentAllowed: snapshot?.micSilent === false || snapshot?.micSilent == null,
          };
        }),
      { timeout: 10_000 },
    )
    .toEqual({
      hasLevel: true,
      hasEnergy: true,
      hasSilent: true,
      silentAllowed: true,
    });

  await page.waitForTimeout(8_000);
  const diagnostics = await page.context().newPage();
  await diagnostics.goto('/app/diagnostics');
  await expect(diagnostics.getByRole('heading', { name: 'Call diagnostics', level: 2 })).toBeVisible();
  const sessionButton = diagnostics.getByRole('button', { name: new RegExp(room.title) });
  await expect(sessionButton).toBeVisible({ timeout: 10_000 });
  await sessionButton.click();
  await expect(diagnostics.getByText('Mic live').first()).toBeVisible();
  await expect(diagnostics.getByText(/mic live|mic liveness n\/a/i).first()).toBeVisible();
  await expect(diagnostics.getByText('MIC SILENT')).toHaveCount(0);

  const listResponse = await request.get('/api/meeting-sessions/diagnostics-log?page=1&pageSize=50');
  expect(listResponse.ok()).toBe(true);
  const listBody = (await listResponse.json()) as { sessions: Array<{ id: string; roomTitle: string }> };
  const sessionId = listBody.sessions.find((session) => session.roomTitle === room.title)?.id;
  expect(sessionId).toBeTruthy();
  const response = await request.get(`/api/meeting-sessions/${sessionId}/diagnostics`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    entries: Array<{ payload: { outboundAudioLevel?: number | null; outboundAudioEnergy?: number | null; micSilent?: boolean | null } }>;
  };
  const payload = body.entries.at(-1)?.payload;
  expect(payload).toHaveProperty('outboundAudioLevel');
  expect(payload).toHaveProperty('outboundAudioEnergy');
  expect(payload).toHaveProperty('micSilent');
  expect(payload?.outboundAudioLevel == null || typeof payload.outboundAudioLevel === 'number').toBe(true);
  expect(payload?.outboundAudioEnergy == null || typeof payload.outboundAudioEnergy === 'number').toBe(true);
  expect(payload?.micSilent === false || payload?.micSilent == null).toBe(true);

  await diagnostics.screenshot({ path: `${SCREENSHOT_DIR}/mic-liveness-diagnostics.png`, fullPage: true });
  await diagnostics.close();
  await guest.context().close();
});

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitGuest(browser: Browser, owner: Page, room: TestRoom): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installFlowingMedia(guest, 'guest');
  await joinGuestAndWait(guest, room, 'guest-miclive');
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-miclive' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  return guest;
}

async function installFlowingMedia(page: Page, role: 'host' | 'guest'): Promise<void> {
  await page.addInitScript(({ role }) => {
    type DiagnosticTrack = MediaStreamTrack & { __diagDeviceId?: string; __diagLabel?: string };
    const originalMediaDevices = navigator.mediaDevices;
    const micId = role === 'host' ? 'miclive-host-mic' : 'miclive-guest-mic';
    const camId = role === 'host' ? 'miclive-host-camera' : 'miclive-guest-camera';

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          fakeDevice('audioinput', micId, role === 'host' ? 'Flowing Host Microphone' : 'Flowing Guest Microphone'),
          fakeDevice('videoinput', camId, role === 'host' ? 'Host Camera' : 'Guest Camera'),
          fakeDevice('audiooutput', `${role}-speaker`, 'Speaker'),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio) tracks.push(await audioTrack(micId, role === 'host' ? 'Flowing Host Microphone' : 'Flowing Guest Microphone'));
          if (constraints.video) tracks.push(videoTrack(camId, role === 'host' ? 'Host Camera' : 'Guest Camera'));
          return new MediaStream(tracks);
        },
      },
    });

    function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
      return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
    }

    async function audioTrack(deviceId: string, label: string): Promise<MediaStreamTrack> {
      const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('AudioContext unavailable');
      const context = new AudioContextCtor();
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      oscillator.frequency.value = role === 'host' ? 440 : 550;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      const track = destination.stream.getAudioTracks()[0] as DiagnosticTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      return track;
    }

    function videoTrack(deviceId: string, label: string): MediaStreamTrack {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = role === 'host' ? '#155e75' : '#166534';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff';
        context.font = '42px sans-serif';
        context.fillText(label, 32, 96);
      }
      const track = canvas.captureStream(10).getVideoTracks()[0] as DiagnosticTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      return track;
    }
  }, { role });
}
