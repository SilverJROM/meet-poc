import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { expect, type APIRequestContext, type Browser, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXC3_PREFIX = 'FIXC3';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc3/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('FIXC3.1 share layout reflows, sorts active speaker, collapses, and returns to grid', async ({ browser, page, request }) => {
  await installFakeDisplayMedia(page);
  const room = await createFixRoom(request, 'share-layout');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host');
  const guests = [
    await admitBrowserGuest(browser, page, room, 'guest-a'),
    await admitBrowserGuest(browser, page, room, 'guest-b'),
    await admitBrowserGuest(browser, page, room, 'guest-c'),
  ];
  await expect(page.locator('app-tile')).toHaveCount(4);
  await closeParticipants(page);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect(page.locator('.share-stage app-tile')).toHaveCount(1);
  await expect(page.locator('.share-strip .strip-list app-tile')).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.shareLayoutActive)).toBe(true);

  const canInjectSpeaker = await page.evaluate(() => !!window.__meetDebug?.injectActiveSpeakerStream);
  if (canInjectSpeaker) {
    await activateActiveSpeaker(page, 'guest-c');
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.activeSpeakerId || ''), { timeout: 10000 }).toBeTruthy();
    const firstStripName = page.locator('.share-strip .strip-list app-tile').first().locator('.name-label');
    await expect(firstStripName).toContainText('guest-c', { timeout: 15000 });
    await expect(page.locator('.share-strip .strip-list app-tile').first().locator('article.tile')).toHaveClass(/is-speaking/);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/share-strip.png`, fullPage: true });
  }

  const expandedWidth = await page.locator('.share-stage').boundingBox();
  await page.getByRole('button', { name: 'Hide participant strip' }).click();
  await expect(page.locator('.share-strip.collapsed')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.shareStripCollapsed)).toBe(true);
  const collapsedWidth = await page.locator('.share-stage').boundingBox();
  expect((collapsedWidth?.width ?? 0) - (expandedWidth?.width ?? 0)).toBeGreaterThan(100);
  if (canInjectSpeaker) await page.screenshot({ path: `${SCREENSHOT_DIR}/share-collapsed.png`, fullPage: true });

  await page.getByRole('button', { name: 'Stop sharing screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toHaveCount(0);
  await expect(page.locator('.tiles-grid app-tile')).toHaveCount(4);

  for (const guest of guests) await guest.context().close();
});

test('FIXC3.2 share strip remains scrollable with 8 admitted participants', async ({ page, request }) => {
  await installFakeDisplayMedia(page);
  const room = await createFixRoom(request, 'strip-scroll');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host-scroll');
  const sockets: WebSocket[] = [];
  for (let index = 1; index <= 7; index += 1) {
    sockets.push(await admitSocketGuest(page, room, `socket-${index}`));
  }
  await expect(page.locator('app-tile')).toHaveCount(8);
  await closeParticipants(page);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect(page.locator('.share-strip .strip-list app-tile')).toHaveCount(8);
  await expect
    .poll(() =>
      page.locator('.share-strip .strip-list').evaluate((element) => ({
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
      })),
    )
    .toMatchObject({ overflowY: 'auto' });
  const dimensions = await page.locator('.share-strip .strip-list').evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  for (const socket of sockets) socket.close();
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXC3_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(room.url);
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await admitWaiting(owner, name);
  await expect(guest.locator('.call-panel')).toBeVisible();
  return guest;
}

async function admitSocketGuest(owner: Page, room: TestRoom, name: string): Promise<WebSocket> {
  const wsOrigin = process.env.E2E_WS_ORIGIN || 'ws://localhost:4700';
  const socket = new WebSocket(`${wsOrigin}/ws`);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ type: 'join', room: room.id, name }));
  const admitted = nextSocketMessage(socket, 'admitted');
  await admitWaiting(owner, name);
  await admitted;
  return socket;
}

async function admitWaiting(owner: Page, name: string): Promise<void> {
  await openParticipants(owner);
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
}

async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) {
    await page.getByRole('button', { name: 'Show participants' }).click();
  }
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

async function closeParticipants(page: Page): Promise<void> {
  if ((await page.locator('app-participant-sidebar .participant-sidebar.open').count()) > 0) {
    await page.getByRole('button', { name: 'Hide participants' }).click();
  }
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toHaveCount(0);
}

async function injectActiveSpeaker(page: Page, name: string): Promise<void> {
  await page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
    if (!peer || !window.__meetDebug?.injectActiveSpeakerStream) throw new Error('speaker peer debug hook missing');
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
        phase += (2 * Math.PI * 440) / sampleRate;
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
    setInterval(writeFrame, 10);
    writeFrame();
    window.__meetDebug.injectActiveSpeakerStream(peer.id, new MediaStream([generator]));
  }, name);
}

async function activateActiveSpeaker(page: Page, name: string): Promise<void> {
  const usedForceHook = await page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
    if (!peer || !window.__meetDebug?.forceActiveSpeakerForTest) return false;
    window.__meetDebug.forceActiveSpeakerForTest(peer.id);
    return true;
  }, name);
  if (!usedForceHook) await injectActiveSpeaker(page, name);
}

async function nextSocketMessage(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), 8000);
    socket.on('message', function onMessage(raw) {
      const msg = JSON.parse(String(raw));
      if (msg.type !== type) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(msg);
    });
    socket.once('error', reject);
  });
}

async function installFakeDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#e5f0ff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1e3a8a';
          context.font = '72px sans-serif';
          context.fillText('Shared screen', 80, 140);
          context.fillStyle = '#ffffff';
          context.fillRect(80, 210, 1120, 360);
        }
        return canvas.captureStream();
      },
    });
  });
}
