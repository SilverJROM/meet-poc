import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, joinGuestAndWait, type TestRoom } from '../../fixtures/rooms';

const DIAGLOG_PREFIX = 'DIAGLOG28';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-diaglog/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGLOG_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGLOG_PREFIX);
});

test('DR-28 persists per-call diagnostics with active outbound sender track device info', async ({ browser, page, request }) => {
  await installDiagnosticMedia(page, 'host');
  const room = await createRoomViaApi(request, `${DIAGLOG_PREFIX} sender tracks ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');

  const guest = await admitGuest(browser, page, room);
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 12000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const debug = (window as unknown as {
            __meetDebug?: { diagnosticSnapshot?: () => { peers: Array<{ outboundAudio: { deviceId: string | null; label: string | null; source: string } }> } };
          }).__meetDebug;
          return debug?.diagnosticSnapshot?.().peers.some((peer) => peer.outboundAudio.deviceId === 'diaglog-host-mic') || false;
        }),
      { timeout: 8000 },
    )
    .toBe(true);

  await page.waitForTimeout(2500);
  await page.goto('/app/diagnostics');
  await expect(page.getByRole('heading', { name: 'Call diagnostics', level: 2 })).toBeVisible();
  const sessionButton = page.getByRole('button', { name: new RegExp(room.title) });
  await expect(sessionButton).toBeVisible({ timeout: 10000 });
  await sessionButton.click();
  await expect(page.getByText('External USB Microphone').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('diaglog-host-mic').first()).toBeVisible();
  await expect(page.getByText(/candidate/i)).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/diagnostics-log-view.png`, fullPage: true });

  await guest.context().close();
});

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitGuest(browser: Browser, owner: Page, room: TestRoom): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installDiagnosticMedia(guest, 'guest');
  await joinGuestAndWait(guest, room, 'guest');
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  return guest;
}

async function installDiagnosticMedia(page: Page, role: 'host' | 'guest'): Promise<void> {
  await page.addInitScript(({ role }) => {
    type DiagnosticTrack = MediaStreamTrack & { __diagDeviceId?: string; __diagLabel?: string };
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    const micId = role === 'host' ? 'diaglog-host-mic' : 'diaglog-guest-mic';
    const camId = role === 'host' ? 'diaglog-host-camera' : 'diaglog-guest-camera';

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          fakeDevice('audioinput', micId, role === 'host' ? 'External USB Microphone' : 'Guest Microphone'),
          fakeDevice('videoinput', camId, role === 'host' ? 'Host Camera' : 'Guest Camera'),
          fakeDevice('audiooutput', `${role}-speaker`, 'Speaker'),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio) tracks.push(await audioTrack(micId, role === 'host' ? 'External USB Microphone' : 'Guest Microphone'));
          if (constraints.video) tracks.push(videoTrack(camId, role === 'host' ? 'Host Camera' : 'Guest Camera'));
          return new MediaStream(tracks);
        },
      },
    });

    function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
      return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
    }

    async function audioTrack(deviceId: string, label: string): Promise<MediaStreamTrack> {
      const stream = await originalGetUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0] as DiagnosticTrack;
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
        context.fillStyle = role === 'host' ? '#1f6f78' : '#7a4d2b';
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
