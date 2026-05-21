import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const DR55_PREFIX = 'DR55RENEG';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-F2-renegotiate/screenshots';

type InboundVideoSnapshot = {
  framesDecoded: number | null;
  bytesReceived: number | null;
  trackReadyState: MediaStreamTrackState | null;
  receiverTrackKind: string | null;
  currentDirection: RTCRtpTransceiverDirection | null;
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DR55_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DR55_PREFIX);
});

test('DR-55 camera-off sender later sends camera and screen frames over the pre-negotiated video sender', async ({ browser, page, request }) => {
  test.setTimeout(120_000);
  await installRenegotiateMedia(page.context(), 'host');
  const room = await createRoomViaApi(request, `${DR55_PREFIX} camera off ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'host', true);

  const guest = await admitGuest(browser, page, room, 'guest-camera-off', false);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-camera-off' }).locator('.state')).toHaveText('connected', { timeout: 15_000 });

  const hostIdOnGuest = await expectPeerId(guest, 'host');
  await expect
    .poll(() => senderFor(guest, hostIdOnGuest), { timeout: 10_000 })
    .toMatchObject({
      videoActive: false,
      videoPriority: 'low',
      videoNetworkPriority: 'low',
      videoMaxBitrate: 700000,
      videoScaleResolutionDownBy: 1,
      videoMaxFramerate: 30,
    });

  await guest.getByRole('button', { name: 'Turn camera on' }).click();
  const cameraFrames = await expectInboundVideoFrames(page, 'guest-camera-off', 0);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-camera-off' }).locator('video')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/receiver-camera-after-audio-only-join.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Share screen' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.find((peer) => peer.name === 'guest-camera-off')?.screenOn), { timeout: 10_000 }).toBe(true);
  await expectInboundVideoFrames(page, 'guest-camera-off', cameraFrames.framesDecoded ?? 0);
  await expect(page.locator('.call-panel.share-layout')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/receiver-screen-after-audio-only-join.png`, fullPage: true });

  await guest.context().close();
});

test('DR-55 camera-on at join still negotiates video and decodes frames', async ({ browser, page, request }) => {
  test.setTimeout(90_000);
  await installRenegotiateMedia(page.context(), 'host');
  const room = await createRoomViaApi(request, `${DR55_PREFIX} camera on ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'host', true);

  const guest = await admitGuest(browser, page, room, 'guest-camera-on', true);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-camera-on' }).locator('.state')).toHaveText('connected', { timeout: 15_000 });
  await expectInboundVideoFrames(page, 'guest-camera-on', 0);

  await guest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string, cameraOn: boolean): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  const cameraToggle = page.locator('input[name="cameraRequested"]');
  if ((await cameraToggle.isChecked()) !== cameraOn) await cameraToggle.setChecked(cameraOn);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitGuest(browser: Browser, owner: Page, room: TestRoom, name: string, cameraOn: boolean): Promise<Page> {
  const context = await browser.newContext();
  await installRenegotiateMedia(context, name);
  const guest = await context.newPage();
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  const cameraToggle = guest.locator('input[name="cameraRequested"]');
  if ((await cameraToggle.isChecked()) !== cameraOn) await cameraToggle.setChecked(cameraOn);
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  return guest;
}

async function expectPeerId(page: Page, name: string): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate((peerName) => {
          const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
          return peer?.id ?? null;
        }, name),
      { timeout: 10_000 },
    )
    .not.toBeNull();
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
    if (!peer?.id) throw new Error(`missing peer ${peerName}`);
    return peer.id;
  }, name);
}

async function senderFor(page: Page, peerId: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((id) => window.__meetDebug?.senderSnapshot?.().find((item) => item.id === id) ?? null, peerId);
}

async function expectInboundVideoFrames(page: Page, peerName: string, greaterThanFrames: number): Promise<InboundVideoSnapshot> {
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__meetDebug?.sampleConnectionQualityForTest?.());
        return inboundVideoFor(page, peerName);
      },
      { timeout: 30_000, intervals: [1_000, 1_500, 2_000, 2_500] },
    )
    .toMatchObject({
      trackReadyState: 'live',
      receiverTrackKind: 'video',
    });

  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__meetDebug?.sampleConnectionQualityForTest?.());
        const snapshot = await inboundVideoFor(page, peerName);
        return {
          framesAdvanced: (snapshot.framesDecoded ?? 0) > greaterThanFrames,
          bytesArrived: (snapshot.bytesReceived ?? 0) > 0,
          currentDirection: snapshot.currentDirection,
        };
      },
      { timeout: 30_000, intervals: [1_000, 1_500, 2_000, 2_500] },
    )
    .toMatchObject({
      framesAdvanced: true,
      bytesArrived: true,
      currentDirection: 'sendrecv',
    });

  const snapshot = await inboundVideoFor(page, peerName);
  return snapshot;
}

async function inboundVideoFor(page: Page, peerName: string): Promise<InboundVideoSnapshot> {
  return page.evaluate((name) => {
    const peer = window.__meetDebug?.diagnosticSnapshot?.().peers.find((candidate) => candidate.name === name);
    const videoTransceiver = peer?.transceivers.find((transceiver) => transceiver.receiverTrackKind === 'video') ?? null;
    return {
      framesDecoded: peer?.inboundVideo.framesDecoded ?? null,
      bytesReceived: peer?.inboundVideo.bytesReceived ?? null,
      trackReadyState: peer?.inboundVideo.trackReadyState ?? null,
      receiverTrackKind: videoTransceiver?.receiverTrackKind ?? null,
      currentDirection: videoTransceiver?.currentDirection ?? null,
    };
  }, peerName);
}

async function installRenegotiateMedia(context: BrowserContext, role: string): Promise<void> {
  await context.addInitScript(({ role }) => {
    type RenegotiateTrack = MediaStreamTrack & { __diagDeviceId?: string; __diagLabel?: string };
    const originalMediaDevices = navigator.mediaDevices;
    const originalGetUserMedia = originalMediaDevices.getUserMedia.bind(originalMediaDevices);
    const micId = `${role}-dr55-mic`;
    const camId = `${role}-dr55-camera`;

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...originalMediaDevices,
        enumerateDevices: async () => [
          fakeDevice('audioinput', micId, `${role} DR55 Microphone`),
          fakeDevice('videoinput', camId, `${role} DR55 Camera`),
          fakeDevice('audiooutput', `${role}-dr55-speaker`, `${role} DR55 Speaker`),
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          const tracks: MediaStreamTrack[] = [];
          if (constraints.audio) tracks.push(await audioTrack(micId, `${role} DR55 Microphone`));
          if (constraints.video) tracks.push(videoTrack(camId, `${role} DR55 Camera`, '#047857'));
          return new MediaStream(tracks);
        },
        getDisplayMedia: async () => new MediaStream([videoTrack(`${role}-dr55-screen`, `${role} DR55 Screen`, '#1d4ed8')]),
      },
    });

    function fakeDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
      return { kind, deviceId, label, groupId: `${deviceId}-group`, toJSON: () => ({ kind, deviceId, label }) } as MediaDeviceInfo;
    }

    async function audioTrack(deviceId: string, label: string): Promise<MediaStreamTrack> {
      const stream = await originalGetUserMedia({ audio: true, video: false });
      const track = stream.getAudioTracks()[0] as RenegotiateTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      return track;
    }

    function videoTrack(deviceId: string, label: string, color: string): MediaStreamTrack {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d');
      let frame = 0;
      const draw = () => {
        if (!context) return;
        frame += 1;
        context.fillStyle = color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#ffffff';
        context.font = '38px sans-serif';
        context.fillText(label, 28, 82);
        context.fillStyle = '#fbbf24';
        context.fillRect(28 + ((frame * 13) % 520), 150, 72, 72);
      };
      draw();
      const timer = window.setInterval(draw, 100);
      const track = canvas.captureStream(10).getVideoTracks()[0] as RenegotiateTrack;
      track.__diagDeviceId = deviceId;
      track.__diagLabel = label;
      track.addEventListener('ended', () => window.clearInterval(timer));
      return track;
    }
  }, { role });
}
