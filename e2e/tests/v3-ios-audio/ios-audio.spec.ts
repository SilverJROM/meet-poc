import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const IOS_AUDIO_PREFIX = 'IOSAUDIO45';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-ios-audio/screenshots';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
type MixerSnapshot = NonNullable<MeetDebug['remoteAudioMixer']>;
type MeetDebug = {
  peers: { id: string; name: string }[];
  remoteAudioMixer?: {
    mixerEnabled: boolean;
    contextState: AudioContextState | 'none';
    outputAttached: boolean;
    outputPaused: boolean;
    mixedPeerIds: string[];
    mixedTrackIds: string[];
  };
  remoteMedia?: () => {
    id: string;
    audioTracks: number;
    hasRemoteAudioElement: boolean;
    hasRemoteAudioMixer: boolean;
  }[];
  replaceRemoteAudioTrackForTest?: (id: string) => Promise<{ oldTrackId: string | null; newTrackId: string } | null>;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(IOS_AUDIO_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(IOS_AUDIO_PREFIX);
});

test('DR-45 iOS uses one shared remote-audio mixer and rewires when a remote audio track changes', async ({ browser, page, request }) => {
  test.setTimeout(75_000);
  await installFakeMedia(page, 'ios-host', true);
  const room = await createRoomViaApi(request, `${IOS_AUDIO_PREFIX} mixer ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'host');

  const guest = await joinGuest(browser, page, room, 'guest-ios-audio');
  await expect(page.locator('app-tile').filter({ hasText: 'guest-ios-audio' }).locator('.state')).toHaveText('connected', { timeout: 12_000 });

  await enableAudioIfPrompted(page);
  await expect(page.locator('audio[data-remote-audio]')).toHaveCount(0);
  await expect(page.locator('audio[data-remote-audio-mixer]')).toHaveCount(1);
  await expect.poll(() => mixerSnapshot(page), { timeout: 10_000 }).toMatchObject({
    mixerEnabled: true,
    outputAttached: true,
    outputPaused: false,
  });
  await expect.poll(() => mixedTrackCount(page), { timeout: 10_000 }).toBe(1);
  await expectRemoteDebug(page, 'guest-ios-audio', {
    audioTracks: 1,
    hasRemoteAudioElement: false,
    hasRemoteAudioMixer: true,
  });

  const before = await mixerSnapshot(page);
  const replacement = await page.evaluate(async (peerName) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === peerName);
    if (!peer?.id || !window.__meetDebug?.replaceRemoteAudioTrackForTest) return null;
    return window.__meetDebug.replaceRemoteAudioTrackForTest(peer.id);
  }, 'guest-ios-audio');
  expect(replacement?.newTrackId).toBeTruthy();
  expect(replacement?.newTrackId).not.toBe(before.mixedTrackIds[0]);

  await expect.poll(() => mixerSnapshot(page), { timeout: 10_000 }).toMatchObject({
    mixedTrackIds: [replacement!.newTrackId],
    outputPaused: false,
  });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/ios-shared-audio-mixer.png`, fullPage: true });

  await guest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installFakeMedia(guest, name, false);
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();

  const sidebar = owner.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  return guest;
}

async function enableAudioIfPrompted(page: Page): Promise<void> {
  const enable = page.getByRole('button', { name: 'Enable audio' });
  if ((await enable.count()) > 0 && (await enable.isVisible())) await enable.click();
}

async function mixerSnapshot(page: Page): Promise<MixerSnapshot> {
  const snapshot = await page.evaluate(() => window.__meetDebug?.remoteAudioMixer ?? null);
  if (!snapshot) throw new Error('remote audio mixer debug snapshot missing');
  return snapshot;
}

async function mixedTrackCount(page: Page): Promise<number> {
  const snapshot = await mixerSnapshot(page);
  return snapshot?.mixedTrackIds.length ?? 0;
}

async function expectRemoteDebug(page: Page, peerName: string, expected: Record<string, unknown>): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((name) => {
          const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === name);
          return window.__meetDebug?.remoteMedia?.().find((item) => item.id === peer?.id) ?? null;
        }, peerName),
      { timeout: 10_000 },
    )
    .toMatchObject(expected);
}

async function installFakeMedia(page: Page, role: string, ios: boolean): Promise<void> {
  await page.addInitScript(
    ({ role, ios, userAgent }) => {
      if (ios) {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => userAgent });
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
      }

      const originalMediaDevices = navigator.mediaDevices;
      const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
      const micId = `${role}-mic`;
      const camId = `${role}-camera`;

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          ...originalMediaDevices,
          enumerateDevices: async () => [
            fakeDevice('audioinput', micId, `${role} microphone`),
            fakeDevice('videoinput', camId, `${role} camera`),
            fakeDevice('audiooutput', `${role}-speaker`, `${role} speaker`),
          ],
          getUserMedia: async (constraints: MediaStreamConstraints) => {
            const tracks: MediaStreamTrack[] = [];
            if (constraints.audio) tracks.push(await audioTrack());
            if (constraints.video) tracks.push(videoTrack());
            return new MediaStream(tracks);
          },
        },
      });

      function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
        return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
      }

      async function audioTrack(): Promise<MediaStreamTrack> {
        const stream = await originalGetUserMedia({ audio: true, video: false });
        return stream.getAudioTracks()[0];
      }

      function videoTrack(): MediaStreamTrack {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = ios ? '#0f766e' : '#7c3aed';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#fff';
          context.font = '24px sans-serif';
          context.fillText(role, 24, 90);
        }
        return canvas.captureStream(5).getVideoTracks()[0];
      }
    },
    { role, ios, userAgent: IOS_UA },
  );
}

declare global {
  interface Window {
    __meetDebug?: MeetDebug;
  }
}
