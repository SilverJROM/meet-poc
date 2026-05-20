import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type BrowserContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXB1_PREFIX = 'FIXB1';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb1/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupFixb1Artifacts();
});

test.afterAll(() => {
  cleanupFixb1Artifacts();
});

test('FIX-B1.1 buffers offer-before-peer-joined and connects remote audio/video', async ({ browser, request }) => {
  const room = await createFixRoom(request, 'race');
  const hostContext = await browser.newContext();
  await delayPeerJoined(hostContext, 700);
  const host = await hostContext.newPage();
  await loginAsJrom(host);
  await joinOwnerWithCamera(host, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestWithCamera(guest, room, 'guest');
  await admitGuest(host, 'guest');

  await assertConnectedWithRemoteMedia(host);
  await assertConnectedWithRemoteMedia(guest);

  await guestContext.close();
  await hostContext.close();
});

test('FIX-B1.2 recording after peer connection includes remote audio signal', async ({ browser, request, page }) => {
  const room = await createFixRoom(request, 'recording');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await installGeneratedAudioMedia(guest, 660);
  await joinGuest(guest, room, 'tone-guest');
  await admitGuest(page, 'tone-guest');
  await assertConnected(page);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.remoteMedia?.()[0]?.audioTracks || 0), { timeout: 10000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('app-recording-banner')).toContainText('Host is recording');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.recorderSourceCount || 0), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(5200);
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST'),
    page.getByRole('button', { name: 'Stop recording' }).click(),
  ]);
  const uploadJson = await uploadResponse.json();
  const recordingPath = path.resolve('..', 'recordings', uploadJson.file);
  const size = fs.statSync(recordingPath).size;
  expect(size).toBeGreaterThan(5 * 1024);

  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', recordingPath]);
  expect(probe.status, probe.stderr.toString()).toBe(0);
  expect(probe.stdout.toString().trim()).not.toBe('');

  await guestContext.close();
});

test('FIX-B1.3 controls are visibly distinct on the light controls bar', async ({ request, page }) => {
  const room = await createFixRoom(request, 'controls');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/controls-light.png`, fullPage: true });

  const contrast = await page.evaluate(() => {
    const button = document.querySelector('.control-btn');
    const bar = document.querySelector('.controls-bar');
    if (!button || !bar) throw new Error('controls not found');
    return {
      buttonBg: getComputedStyle(button).backgroundColor,
      barBg: getComputedStyle(bar).backgroundColor,
      buttonBorder: getComputedStyle(button).borderColor,
    };
  });
  expect(maxRgbDelta(contrast.buttonBg, contrast.barBg)).toBeGreaterThanOrEqual(8);
  expect(contrast.buttonBorder).not.toBe('rgb(216, 221, 230)');
});

test('FIX-B1.4 background video pause requires mobile viewport and mobile UA', async ({ browser, request }) => {
  const desktopRoom = await createFixRoom(request, 'desktop-ua-gate');
  const desktopContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const desktop = await desktopContext.newPage();
  await loginAsJrom(desktop);
  await joinOwnerWithCamera(desktop, desktopRoom, 'desktop-host');
  await setVisibility(desktop, 'hidden');
  await expect.poll(() => localVideoEnabled(desktop)).toBe(true);
  await desktopContext.close();

  const mobileRoom = await createFixRoom(request, 'mobile-ua-gate');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const mobile = await mobileContext.newPage();
  await loginAsJrom(mobile);
  await joinOwnerWithCamera(mobile, mobileRoom, 'mobile-host');
  await setVisibility(mobile, 'hidden');
  await expect.poll(() => localVideoEnabled(mobile)).toBe(false);
  await mobileContext.close();
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXB1_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function joinGuestWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

async function joinGuest(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

async function admitGuest(host: Page, name: string): Promise<void> {
  const sidebar = host.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await host.getByRole('button', { name: 'Show participants' }).click();
  const row = host.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
}

async function assertConnectedWithRemoteMedia(page: Page): Promise<void> {
  await assertConnected(page);
  await expect.poll(() => remoteVideoStats(page), { timeout: 12000 }).toEqual(
    expect.arrayContaining([expect.objectContaining({ audioTracks: expect.any(Number), videoTracks: expect.any(Number) })]),
  );
  const stats = await remoteVideoStats(page);
  expect(stats.some((item) => item.audioTracks >= 1 && item.videoTracks >= 1)).toBe(true);
}

async function assertConnected(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peerConnectionStates?.().map((peer) => peer.state) || []), { timeout: 12000 }).toContain(
    'connected',
  );
}

async function remoteVideoStats(page: Page): Promise<{ audioTracks: number; videoTracks: number }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('app-tile video'))
      .filter((video): video is HTMLVideoElement => video instanceof HTMLVideoElement && !video.muted)
      .map((video) => {
        const stream = video.srcObject instanceof MediaStream ? video.srcObject : null;
        return {
          audioTracks: stream?.getAudioTracks().length ?? 0,
          videoTracks: stream?.getVideoTracks().length ?? 0,
        };
      }),
  );
}

async function localVideoEnabled(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled);
}

async function setVisibility(page: Page, visibilityState: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visibilityState);
}

async function delayPeerJoined(context: BrowserContext, delayMs: number): Promise<void> {
  await context.addInitScript((delay) => {
    const NativeWebSocket = window.WebSocket;
    class DelayedPeerJoinedSocket extends NativeWebSocket {
      private wrappedOnMessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;

      set onmessage(handler: ((this: WebSocket, ev: MessageEvent) => unknown) | null) {
        this.wrappedOnMessage = handler;
        super.onmessage = handler
          ? (event: MessageEvent) => {
              if (isPeerJoined(event)) {
                window.setTimeout(() => handler.call(this, event), delay);
                return;
              }
              handler.call(this, event);
            }
          : null;
      }

      get onmessage(): ((this: WebSocket, ev: MessageEvent) => unknown) | null {
        return this.wrappedOnMessage;
      }
    }
    Object.assign(DelayedPeerJoinedSocket, NativeWebSocket);
    window.WebSocket = DelayedPeerJoinedSocket;

    function isPeerJoined(event: MessageEvent): boolean {
      try {
        return JSON.parse(String(event.data)).type === 'peer-joined';
      } catch {
        return false;
      }
    }
  }, delayMs);
}

async function installGeneratedAudioMedia(page: Page, frequency: number): Promise<void> {
  await page.addInitScript((tone) => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: () => originalMediaDevices.enumerateDevices(),
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (constraints.video) {
            const videoOnly = await originalGetUserMedia({ video: constraints.video, audio: false });
            tracks.push(...videoOnly.getVideoTracks());
          }
          if (constraints.audio) {
            tracks.push(generatedAudioTrack(tone));
          }
          return new MediaStream(tracks);
        },
      },
    });

    function generatedAudioTrack(toneHz: number): MediaStreamTrack {
      type TrackGenerator = new (init: { kind: 'audio' }) => MediaStreamTrack & { writable: WritableStream<AudioData> };
      const GeneratorCtor = (window as unknown as { MediaStreamTrackGenerator: TrackGenerator }).MediaStreamTrackGenerator;
      const generator = new GeneratorCtor({ kind: 'audio' });
      const writer = generator.writable.getWriter();
      const sampleRate = 48000;
      const frames = 480;
      const duration = Math.round((frames / sampleRate) * 1_000_000);
      let timestamp = 0;
      let phase = 0;
      const writeFrame = () => {
        const data = new Float32Array(frames);
        for (let index = 0; index < frames; index += 1) {
          data[index] = Math.sin(phase) * 0.35;
          phase += (2 * Math.PI * toneHz) / sampleRate;
        }
        const audioData = new AudioData({
          format: 'f32',
          sampleRate,
          numberOfFrames: frames,
          numberOfChannels: 1,
          timestamp,
          duration,
          data,
        });
        timestamp += duration;
        void writer.write(audioData).finally(() => audioData.close());
      };
      window.setInterval(writeFrame, 10);
      writeFrame();
      return generator;
    }
  }, frequency);
}

function maxRgbDelta(a: string, b: string): number {
  const left = rgb(a);
  const right = rgb(b);
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
}

function rgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`not an rgb color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function cleanupFixb1Artifacts(): void {
  cleanupRoomsByPrefix(FIXB1_PREFIX);
  cleanupRecordingsByPrefix(FIXB1_PREFIX);
}
