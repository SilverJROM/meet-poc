import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const AUDIOFIX_PREFIX = 'AUDIOFIX34';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-audiofix/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(AUDIOFIX_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(AUDIOFIX_PREFIX);
});

test('DR-34 remote audio uses a live dedicated audio sink when camera turns off', async ({ browser, page, request }) => {
  test.setTimeout(60_000);
  await installAudiofixMedia(page, 'host');
  const room = await createRoomViaApi(request, `${AUDIOFIX_PREFIX} camera off ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'host');

  const guest = await admitCameraGuest(browser, page, room, 'guest-audiofix');
  const remoteTile = page.locator('app-tile').filter({ hasText: 'guest-audiofix' });
  await expect(remoteTile.locator('.state')).toHaveText('connected', { timeout: 12_000 });

  await ensureRemoteAudioEnabled(page);
  await expect(remoteTile.locator('video')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => remoteTile.locator('video').evaluate((video) => (video as HTMLVideoElement).muted), { timeout: 8_000 }).toBe(true);
  await expectRemoteAudioState(page, 'guest-audiofix', { cameraOff: false });

  await guest.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(remoteTile.locator('.camera-off-avatar')).toBeVisible({ timeout: 10_000 });
  await expectRemoteAudioState(page, 'guest-audiofix', { cameraOff: true });

  await guest.getByRole('button', { name: 'Turn camera on' }).click();
  await expect(remoteTile.locator('video')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => remoteTile.locator('video').evaluate((video) => (video as HTMLVideoElement).muted), { timeout: 8_000 }).toBe(true);
  await expectRemoteAudioState(page, 'guest-audiofix', { cameraOff: false });

  await guest.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(remoteTile.locator('.camera-off-avatar')).toBeVisible({ timeout: 10_000 });
  await expectRemoteAudioState(page, 'guest-audiofix', { cameraOff: true });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/remote-audio-camera-off.png`, fullPage: true });

  await guest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitCameraGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installAudiofixMedia(guest, 'guest');
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByLabel('Start with camera on').check();
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
  await openParticipants(owner);
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await closeParticipants(owner);
  return guest;
}

async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

async function closeParticipants(page: Page): Promise<void> {
  if ((await page.locator('app-participant-sidebar .participant-sidebar.open').count()) > 0) {
    await page.getByRole('button', { name: 'Hide participants' }).click();
  }
}

async function ensureRemoteAudioEnabled(page: Page): Promise<void> {
  const enable = page.getByRole('button', { name: 'Enable audio' });
  if ((await enable.count()) > 0 && (await enable.isVisible())) await enable.click();
}

async function expectRemoteAudioState(page: Page, peerName: string, expected: { cameraOff: boolean }): Promise<void> {
  const remoteTile = page.locator('app-tile').filter({ hasText: peerName });
  const remoteAudio = remoteTile.locator('audio[data-remote-audio]');
  await expect(remoteAudio).toHaveCount(1);
  await expect.poll(() => remoteAudio.evaluate((audio) => !(audio as HTMLAudioElement).muted), { timeout: 8_000 }).toBe(true);
  await expect.poll(() => remoteAudio.evaluate((audio) => !(audio as HTMLAudioElement).paused), { timeout: 8_000 }).toBe(true);

  const domState = await remoteAudio.evaluate((audio) => {
    const element = audio as HTMLAudioElement;
    const stream = element.srcObject as MediaStream | null;
    return {
      audioTracks: stream?.getAudioTracks().length ?? 0,
      muted: element.muted,
      paused: element.paused,
      playsInline: element.hasAttribute('playsinline'),
    };
  });
  expect(domState).toMatchObject({ audioTracks: 1, muted: false, paused: false, playsInline: true });

  const debugState = await page.evaluate((name) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === name);
    return window.__meetDebug?.remoteMedia?.().find((item) => item.id === peer?.id) ?? null;
  }, peerName);
  expect(debugState).toMatchObject({
    audioTracks: 1,
    hasRemoteAudioElement: true,
    remoteAudioUsesPeerStream: true,
  });

  if (expected.cameraOff) {
    await expect(remoteTile.locator('video')).toHaveCount(0);
  } else {
    await expect(remoteTile.locator('video')).toHaveCount(1);
  }
}

async function installAudiofixMedia(page: Page, role: 'host' | 'guest'): Promise<void> {
  await page.addInitScript(({ role }) => {
    type AudiofixTrack = MediaStreamTrack & { __diagDeviceId?: string; __diagLabel?: string };
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    const micId = `${role}-audiofix-mic`;
    const camId = `${role}-audiofix-camera`;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          fakeDevice('audioinput', micId, `${role} Audiofix Microphone`),
          fakeDevice('videoinput', camId, `${role} Audiofix Camera`),
          fakeDevice('audiooutput', `${role}-audiofix-speaker`, `${role} Audiofix Speaker`),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio) tracks.push(await audioTrack(micId, `${role} Audiofix Microphone`));
          if (constraints.video) tracks.push(videoTrack(camId, `${role} Audiofix Camera`));
          return new MediaStream(tracks);
        },
      },
    });

    function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
      return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
    }

    async function audioTrack(deviceId: string, label: string): Promise<MediaStreamTrack> {
      const stream = await originalGetUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0] as AudiofixTrack;
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
        context.fillStyle = role === 'host' ? '#1d4ed8' : '#047857';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#ffffff';
        context.font = '40px sans-serif';
        context.fillText(label, 32, 92);
      }
      const track = canvas.captureStream(10).getVideoTracks()[0] as AudiofixTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      return track;
    }
  }, { role });
}
