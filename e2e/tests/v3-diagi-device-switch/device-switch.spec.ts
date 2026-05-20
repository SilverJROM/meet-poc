import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagi/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('DR-25 lobby picker sends exact camera/mic deviceId, while mobile flip sends facingMode only', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeDeviceMedia(page);
  const room = await createRoomViaApi(request, `DIAGI lobby ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url);

  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expect(page.locator('app-device-dialog .camera-select')).toBeVisible();

  await page.locator('app-device-dialog .mic-select').selectOption('diagi-mic-2');
  await expect.poll(() => lastAudioDevice(page), { timeout: 8000 }).toBe('diagi-mic-2');
  await expect.poll(() => localTrackDevice(page, 'audio'), { timeout: 8000 }).toBe('diagi-mic-2');

  await page.locator('app-device-dialog .camera-select').selectOption('diagi-cam-2');
  await expect.poll(() => lastVideoTarget(page), { timeout: 8000 }).toEqual({ deviceId: 'diagi-cam-2', facingMode: null });
  await expect.poll(() => localTrackDevice(page, 'video'), { timeout: 8000 }).toBe('diagi-cam-2');

  await page.getByRole('button', { name: 'Flip camera' }).first().click();
  await expect.poll(() => lastVideoTarget(page), { timeout: 8000 }).toEqual({ deviceId: null, facingMode: 'environment' });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/device-switch.png`, fullPage: true });
});

test('DR-25 in-call picker hot-swaps camera/mic tracks and keeps audio sender priority high', async ({ browser, page, request }) => {
  await installFakeDeviceMedia(page);
  const room = await createRoomViaApi(request, `DIAGI in-call ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guest = await createGuest(browser, room, 'guest');
  await admitGuest(page, 'guest');
  await assertConnected(page);
  await assertConnected(guest);

  await page.getByRole('button', { name: 'Device settings', exact: true }).click();
  await expect(page.locator('.modal-presentation .device-dialog')).toBeVisible();

  const beforeAudio = await localTrackId(page, 'audio');
  await page.locator('.modal-presentation .mic-select').selectOption('diagi-mic-2');
  await expect.poll(() => localTrackId(page, 'audio'), { timeout: 8000 }).not.toBe(beforeAudio);
  await expect.poll(() => lastAudioDevice(page), { timeout: 8000 }).toBe('diagi-mic-2');
  await expect.poll(() => localTrackDevice(page, 'audio'), { timeout: 8000 }).toBe('diagi-mic-2');
  await expect.poll(() => firstSenderAudioPriority(page), { timeout: 8000 }).toEqual({ priority: 'high', networkPriority: 'high' });

  const beforeVideo = await localTrackId(page, 'video');
  await page.locator('.modal-presentation .camera-select').selectOption('diagi-cam-2');
  await expect.poll(() => localTrackId(page, 'video'), { timeout: 8000 }).not.toBe(beforeVideo);
  await expect.poll(() => lastVideoTarget(page), { timeout: 8000 }).toEqual({ deviceId: 'diagi-cam-2', facingMode: null });
  await expect.poll(() => localTrackDevice(page, 'video'), { timeout: 8000 }).toBe('diagi-cam-2');

  await assertConnected(page);
  await assertConnected(guest);
  await guest.context().close();
});

async function installFakeDeviceMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type DiagiTrack = MediaStreamTrack & { __diagiDeviceId?: string };
    type DiagiCall = { audioDeviceId: string | null; videoDeviceId: string | null; facingMode: string | null; constraints: MediaStreamConstraints };
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    const calls: DiagiCall[] = [];

    Object.defineProperty(window, '__diagiMediaCalls', {
      configurable: true,
      value: calls,
    });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          fakeDevice('audioinput', 'diagi-mic-1', 'DIAGI Microphone 1'),
          fakeDevice('audioinput', 'diagi-mic-2', 'DIAGI Microphone 2'),
          fakeDevice('videoinput', 'diagi-cam-1', 'DIAGI Camera 1'),
          fakeDevice('videoinput', 'diagi-cam-2', 'DIAGI Camera 2'),
          fakeDevice('audiooutput', 'diagi-speaker-1', 'DIAGI Speaker'),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const audioDeviceId = requestedDeviceId(constraints.audio) ?? (constraints.audio ? 'diagi-mic-1' : null);
          const videoDeviceId = requestedDeviceId(constraints.video);
          const facingMode = requestedFacingMode(constraints.video);
          calls.push({
            audioDeviceId,
            videoDeviceId,
            facingMode,
            constraints: JSON.parse(JSON.stringify(constraints)) as MediaStreamConstraints,
          });

          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio) tracks.push(await audioTrack(audioDeviceId ?? 'diagi-mic-1'));
          if (constraints.video) tracks.push(videoTrack(videoDeviceId ?? `facing-${facingMode ?? 'user'}`));
          return new MediaStream(tracks);
        },
      },
    });

    function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
      return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
    }

    function requestedDeviceId(value: boolean | MediaTrackConstraints | undefined): string | null {
      if (!value || value === true) return null;
      const deviceId = value.deviceId;
      if (typeof deviceId === 'string') return deviceId;
      if (deviceId && typeof deviceId === 'object') {
        const exact = (deviceId as ConstrainDOMStringParameters).exact;
        if (typeof exact === 'string') return exact;
        const ideal = (deviceId as ConstrainDOMStringParameters).ideal;
        if (typeof ideal === 'string') return ideal;
      }
      return null;
    }

    function requestedFacingMode(value: boolean | MediaTrackConstraints | undefined): string | null {
      if (!value || value === true) return null;
      const facingMode = value.facingMode;
      if (typeof facingMode === 'string') return facingMode;
      if (facingMode && typeof facingMode === 'object') {
        const exact = (facingMode as ConstrainDOMStringParameters).exact;
        if (typeof exact === 'string') return exact;
        const ideal = (facingMode as ConstrainDOMStringParameters).ideal;
        if (typeof ideal === 'string') return ideal;
      }
      return null;
    }

    async function audioTrack(deviceId: string): Promise<MediaStreamTrack> {
      const stream = await originalGetUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0] as DiagiTrack;
      track.__diagiDeviceId = deviceId;
      return track;
    }

    function videoTrack(deviceId: string): MediaStreamTrack {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = deviceId.includes('2') || deviceId.includes('environment') ? '#14532d' : '#1e3a8a';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f8fafc';
        context.font = '42px sans-serif';
        context.fillText(deviceId, 32, 96);
      }
      const track = canvas.captureStream(10).getVideoTracks()[0] as DiagiTrack;
      track.__diagiDeviceId = deviceId;
      return track;
    }
  });
}

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const debug = (window as unknown as { __meetDebug?: { localStream?: MediaStream | null } }).__meetDebug;
          return debug?.localStream?.getVideoTracks().length || 0;
        }),
      { timeout: 8000 },
    )
    .toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function createGuest(browser: Browser, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFakeDeviceMedia(page);
  await page.goto(new URL(room.url, process.env.E2E_BASE_URL || 'http://localhost:4710').toString());
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
  return page;
}

async function admitGuest(host: Page, name: string): Promise<void> {
  await host.getByRole('button', { name: 'Show participants' }).click();
  const row = host.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
}

async function assertConnected(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const debug = (window as unknown as { __meetDebug?: { peerConnectionStates?: () => { state: string }[] } }).__meetDebug;
          return debug?.peerConnectionStates?.().map((peer) => peer.state) || [];
        }),
      { timeout: 12000 },
    )
    .toContain('connected');
}

async function localTrackId(page: Page, kind: 'audio' | 'video'): Promise<string> {
  return page.evaluate((trackKind) => {
    const debug = (window as unknown as { __meetDebug?: { localStream?: MediaStream | null } }).__meetDebug;
    const stream = debug?.localStream;
    return (trackKind === 'audio' ? stream?.getAudioTracks()[0]?.id : stream?.getVideoTracks()[0]?.id) || '';
  }, kind);
}

async function localTrackDevice(page: Page, kind: 'audio' | 'video'): Promise<string> {
  return page.evaluate((trackKind) => {
    const debug = (window as unknown as { __meetDebug?: { localStream?: MediaStream | null } }).__meetDebug;
    const stream = debug?.localStream;
    const track = (trackKind === 'audio' ? stream?.getAudioTracks()[0] : stream?.getVideoTracks()[0]) as (MediaStreamTrack & { __diagiDeviceId?: string }) | undefined;
    return track?.__diagiDeviceId || '';
  }, kind);
}

async function lastAudioDevice(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const calls = (window as unknown as { __diagiMediaCalls?: { audioDeviceId: string | null }[] }).__diagiMediaCalls ?? [];
    return [...calls].reverse().find((call) => !!call.audioDeviceId)?.audioDeviceId ?? null;
  });
}

async function lastVideoTarget(page: Page): Promise<{ deviceId: string | null; facingMode: string | null }> {
  return page.evaluate(() => {
    const calls = (window as unknown as { __diagiMediaCalls?: { videoDeviceId: string | null; facingMode: string | null }[] }).__diagiMediaCalls ?? [];
    const call = [...calls].reverse().find((entry) => !!entry.videoDeviceId || !!entry.facingMode);
    return { deviceId: call?.videoDeviceId ?? null, facingMode: call?.facingMode ?? null };
  });
}

async function firstSenderAudioPriority(page: Page): Promise<{ priority: unknown; networkPriority: unknown }> {
  return page.evaluate(() => {
    const debug = (window as unknown as {
      __meetDebug?: { senderSnapshot?: () => { audioPriority: unknown; audioNetworkPriority: unknown }[] };
    }).__meetDebug;
    const snapshot = debug?.senderSnapshot?.()[0];
    return { priority: snapshot?.audioPriority ?? null, networkPriority: snapshot?.audioNetworkPriority ?? null };
  });
}
