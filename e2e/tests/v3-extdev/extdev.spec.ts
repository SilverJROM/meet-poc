import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, joinGuestAndWait, type TestRoom } from '../../fixtures/rooms';

const EXTDEV_PREFIX = 'EXTDEV29';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-extdev/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(EXTDEV_PREFIX);
  cleanupRecordingsByPrefix(EXTDEV_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(EXTDEV_PREFIX);
  cleanupRecordingsByPrefix(EXTDEV_PREFIX);
});

test('DR-29 publishes the selected external mic sender through join, switch, fallback, and reconnect', async ({ browser, page, request }) => {
  await installExternalMicMedia(page, 'host');
  const room = await createRoomViaApi(request, `${EXTDEV_PREFIX} external mic ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await openLobbyDeviceDialog(page);
  await expect(page.locator('app-device-dialog .mic-select')).toHaveValue('extdev-external', { timeout: 10_000 });
  await expect.poll(() => localAudioDevice(page), { timeout: 10_000 }).toBe('extdev-external');
  await expect.poll(() => exactAudioCallCount(page, 'extdev-external'), { timeout: 10_000 }).toBe(1);
  await expect.poll(() => audioCallsRequestProcessing(page), { timeout: 10_000 }).toBe(true);

  await page.locator('#display-name').fill('host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expect.poll(() => exactAudioCallCount(page, 'extdev-external'), { timeout: 4_000 }).toBe(1);

  const guestContext = await admitGuest(browser, page, room);
  await expectSenderAudio(page, 'extdev-external', 'External USB Microphone');
  await expectAudioPriority(page);
  await captureDiagnosticsScreenshot(page, room.title);

  await page.getByRole('button', { name: 'Device settings', exact: true }).click();
  await expect(page.locator('.modal-presentation .device-dialog')).toBeVisible();
  await page.locator('.modal-presentation .mic-select').selectOption('extdev-spare');
  await expect.poll(() => localAudioDevice(page), { timeout: 10_000 }).toBe('extdev-spare');
  await expect.poll(() => audioCallsRequestProcessing(page), { timeout: 10_000 }).toBe(true);
  await expectSenderAudio(page, 'extdev-spare', 'Spare USB Microphone');
  await expectAudioPriority(page);

  await page.evaluate(() => {
    window.__extdevFailExactAudio = 'extdev-external';
  });
  await page.locator('.modal-presentation .mic-select').selectOption('extdev-external');
  await expect.poll(() => localAudioDevice(page), { timeout: 10_000 }).toBe('extdev-built-in');
  await expect(page.locator('.modal-presentation .mic-select')).toHaveValue('extdev-built-in', { timeout: 10_000 });
  await expect.poll(() => audioCallsRequestProcessing(page), { timeout: 10_000 }).toBe(true);
  await expectSenderAudio(page, 'extdev-built-in', 'Built-in Microphone');
  await expectAudioPriority(page);

  await page.evaluate(() => {
    window.__extdevFailExactAudio = null;
  });
  await page.locator('.modal-presentation .mic-select').selectOption('extdev-spare');
  await expectSenderAudio(page, 'extdev-spare', 'Spare USB Microphone');

  const attemptsBefore = await page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  await page.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8_000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState), { timeout: 10_000 }).toBe('in-call');
  await expectSenderAudio(page, 'extdev-spare', 'Spare USB Microphone');
  await expectAudioPriority(page);

  await guestContext.close();
});

async function admitGuest(browser: Browser, owner: Page, room: TestRoom): Promise<BrowserContext> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await installExternalMicMedia(guest, 'guest');
  await joinGuestAndWait(guest, room, 'guest-extdev');
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-extdev' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: 'guest-extdev' }).locator('.state')).toHaveText('connected', { timeout: 15_000 });
  return context;
}

async function expectSenderAudio(page: Page, deviceId: string, label: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const peer = window.__meetDebug?.diagnosticSnapshot?.().peers.find((candidate) => !candidate.isLocal && candidate.outboundAudio.source === 'sender');
          return peer?.outboundAudio ?? null;
        }),
      { timeout: 10_000 },
    )
    .toEqual(expect.objectContaining({ source: 'sender', deviceId, label }));
}

async function expectAudioPriority(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const snapshot = window.__meetDebug?.senderSnapshot?.()[0];
          return { priority: snapshot?.audioPriority ?? null, networkPriority: snapshot?.audioNetworkPriority ?? null };
        }),
      { timeout: 8_000 },
    )
    .toEqual({ priority: 'high', networkPriority: 'high' });
}

async function captureDiagnosticsScreenshot(page: Page, roomTitle: string): Promise<void> {
  await page.waitForTimeout(2_500);
  const diagnostics = await page.context().newPage();
  await diagnostics.goto('/app/diagnostics');
  await expect(diagnostics.getByRole('heading', { name: 'Call diagnostics', level: 2 })).toBeVisible();
  const sessionButton = diagnostics.getByRole('button', { name: new RegExp(roomTitle) });
  await expect(sessionButton).toBeVisible({ timeout: 10_000 });
  await sessionButton.click();
  await expect(diagnostics.getByText('External USB Microphone').first()).toBeVisible({ timeout: 10_000 });
  await expect(diagnostics.getByText('extdev-external').first()).toBeVisible();
  await expect(diagnostics.getByText(/EC on.*NS on.*AGC on/).first()).toBeVisible();
  await diagnostics.screenshot({ path: `${SCREENSHOT_DIR}/external-mic-diagnostics.png`, fullPage: true });
  await diagnostics.close();
}

async function openLobbyDeviceDialog(page: Page): Promise<void> {
  if ((await page.locator('app-device-dialog .mic-select').count()) === 0) {
    await page.getByRole('button', { name: 'Test / configure devices' }).click();
  }
  const continueButton = page.locator('app-device-dialog').getByRole('button', { name: 'Continue' });
  if ((await continueButton.count()) > 0) await continueButton.click();
  await expect(page.locator('app-device-dialog .mic-select')).toBeVisible({ timeout: 10_000 });
}

async function localAudioDevice(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const track = window.__meetDebug?.localStream?.getAudioTracks()[0] as (MediaStreamTrack & { __diagDeviceId?: string }) | undefined;
    return track?.getSettings().deviceId || track?.__diagDeviceId || null;
  });
}

async function exactAudioCallCount(page: Page, deviceId: string): Promise<number> {
  return page.evaluate((target) => (window.__extdevMediaCalls ?? []).filter((call) => call.audioDeviceId === target).length, deviceId);
}

async function audioCallsRequestProcessing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const calls = window.__extdevMediaCalls ?? [];
    return (
      calls.length > 0 &&
      calls.every((call) => {
        const audio = call.constraints.audio;
        return (
          !!audio &&
          audio !== true &&
          audio.echoCancellation === true &&
          audio.noiseSuppression === true &&
          audio.autoGainControl === true
        );
      })
    );
  });
}

async function installExternalMicMedia(page: Page, role: 'host' | 'guest'): Promise<void> {
  await page.addInitScript(({ role }) => {
    type ExtdevTrack = MediaStreamTrack & { __diagDeviceId?: string; __diagLabel?: string };
    type ExtdevAudioSettings = {
      echoCancellation?: boolean;
      noiseSuppression?: boolean;
      autoGainControl?: boolean;
      sampleRate: number;
      channelCount: number;
    };
    type ExtdevCall = { audioDeviceId: string | null; constraints: MediaStreamConstraints };
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    const calls: ExtdevCall[] = [];
    const hostAudioDevices = [
      { id: 'extdev-external', label: 'External USB Microphone' },
      { id: 'extdev-built-in', label: 'Built-in Microphone' },
      { id: 'extdev-spare', label: 'Spare USB Microphone' },
    ];
    const guestAudioDevices = [{ id: 'extdev-guest-mic', label: 'Guest Microphone' }];
    const audioDevices = role === 'host' ? hostAudioDevices : guestAudioDevices;
    const defaultAudioId = role === 'host' ? 'extdev-built-in' : 'extdev-guest-mic';

    Object.defineProperty(window, '__extdevMediaCalls', { configurable: true, value: calls });
    Object.defineProperty(window, '__extdevFailExactAudio', { configurable: true, writable: true, value: null });

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          ...audioDevices.map((device) => fakeDevice('audioinput', device.id, device.label)),
          fakeDevice('videoinput', `${role}-camera`, `${role} Camera`),
          fakeDevice('audiooutput', `${role}-speaker`, `${role} Speaker`),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const requestedAudio = requestedDeviceId(constraints.audio);
          const audioDeviceId = requestedAudio ?? (constraints.audio ? defaultAudioId : null);
          const audioSettings = processingSettings(constraints.audio);
          calls.push({
            audioDeviceId,
            constraints: JSON.parse(JSON.stringify(constraints)) as MediaStreamConstraints,
          });
          if (requestedAudio && (window.__extdevFailExactAudio === requestedAudio || !audioDevices.some((device) => device.id === requestedAudio))) {
            throw new DOMException(`Requested microphone is unavailable: ${requestedAudio}`, 'OverconstrainedError');
          }

          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio && audioDeviceId) tracks.push(await audioTrack(audioDeviceId, labelFor(audioDeviceId), audioSettings));
          if (constraints.video) tracks.push(videoTrack(`${role}-camera`, `${role} Camera`));
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

    function processingSettings(value: boolean | MediaTrackConstraints | undefined): ExtdevAudioSettings {
      const constraints = value && value !== true ? value : {};
      return {
        echoCancellation: constraints.echoCancellation === true,
        noiseSuppression: constraints.noiseSuppression === true,
        autoGainControl: constraints.autoGainControl === true,
        sampleRate: 48000,
        channelCount: 1,
      };
    }

    async function audioTrack(deviceId: string, label: string, settings: ExtdevAudioSettings): Promise<MediaStreamTrack> {
      const stream = await originalGetUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0] as ExtdevTrack;
      const originalSettings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...originalSettings(), ...settings, deviceId });
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
        context.fillStyle = '#234155';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#fff';
        context.font = '42px sans-serif';
        context.fillText(label, 32, 96);
      }
      const track = canvas.captureStream(10).getVideoTracks()[0] as ExtdevTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      return track;
    }

    function labelFor(deviceId: string): string {
      return audioDevices.find((device) => device.id === deviceId)?.label ?? deviceId;
    }
  }, { role });
}

declare global {
  interface Window {
    __extdevMediaCalls?: { audioDeviceId: string | null; constraints: MediaStreamConstraints }[];
    __extdevFailExactAudio?: string | null;
  }
}
