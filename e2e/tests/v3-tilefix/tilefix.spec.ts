import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type BrowserContext, type Locator, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const TILEFIX_PREFIX = 'TILEFIX';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-tilefix/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(TILEFIX_PREFIX);
  cleanupRecordingsByPrefix(TILEFIX_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(TILEFIX_PREFIX);
  cleanupRecordingsByPrefix(TILEFIX_PREFIX);
});

test('DR-30 mirrors only the local self-view camera and never remote cameras or screen share', async ({ browser, page }) => {
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `${TILEFIX_PREFIX} mirror ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  await turnCameraOn(page);

  const guestContext = await admitCameraGuest(browser, page, room, 'guest-video');
  const localVideo = page.locator('app-tile').filter({ hasText: 'host' }).locator('video');
  const remoteVideo = page.locator('app-tile').filter({ hasText: 'guest-video' }).locator('video');

  await expect(localVideo).toBeVisible();
  await expect(remoteVideo).toBeVisible();
  await expectMirrored(localVideo, 'local self-view camera');
  await expectNotMirrored(remoteVideo, 'remote camera tile');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/camera-mirrored.png`, fullPage: true });

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  const shareVideo = page.locator('.share-stage app-tile video');
  await expect(shareVideo).toBeVisible();
  await expectNotMirrored(shareVideo, 'presented screen share');
  await expectMirrored(page.locator('.share-strip app-tile').filter({ hasText: 'host' }).locator('video'), 'local self-view camera in share strip');
  await expectNotMirrored(page.locator('.share-strip app-tile').filter({ hasText: 'guest-video' }).locator('video'), 'remote camera in share strip');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/screenshare-not-mirrored.png`, fullPage: true });

  await guestContext.close();
});

test('DR-32 active-speaker highlight does not reorder gallery or share-strip tiles', async ({ browser, page }) => {
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `${TILEFIX_PREFIX} order ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  const guestA = await admitCameraGuest(browser, page, room, 'guest-a');
  const guestB = await admitCameraGuest(browser, page, room, 'guest-b');

  const galleryOrder = await tileNames(page.locator('.tiles-grid app-tile .name-label'));
  await forceActiveSpeaker(page, 'guest-b');
  await expect(page.locator('.tiles-grid app-tile').filter({ hasText: 'guest-b' }).locator('article.tile')).toHaveClass(/is-speaking/);
  expect(await tileNames(page.locator('.tiles-grid app-tile .name-label'))).toEqual(galleryOrder);
  await forceActiveSpeaker(page, 'guest-a');
  await expect(page.locator('.tiles-grid app-tile').filter({ hasText: 'guest-a' }).locator('article.tile')).toHaveClass(/is-speaking/);
  expect(await tileNames(page.locator('.tiles-grid app-tile .name-label'))).toEqual(galleryOrder);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  const stripOrder = await tileNames(page.locator('.share-strip .strip-list app-tile .name-label'));
  await forceActiveSpeaker(page, 'guest-b');
  await expect(page.locator('.share-strip app-tile').filter({ hasText: 'guest-b' }).locator('article.tile')).toHaveClass(/is-speaking/);
  expect(await tileNames(page.locator('.share-strip .strip-list app-tile .name-label'))).toEqual(stripOrder);
  await forceActiveSpeaker(page, 'guest-a');
  await expect(page.locator('.share-strip app-tile').filter({ hasText: 'guest-a' }).locator('article.tile')).toHaveClass(/is-speaking/);
  expect(await tileNames(page.locator('.share-strip .strip-list app-tile .name-label'))).toEqual(stripOrder);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/stable-order-active-speaker.png`, fullPage: true });

  await guestA.close();
  await guestB.close();
});

async function admitCameraGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<BrowserContext> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(room.url + '?sfu=0');
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByLabel('Start with camera on').check();
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await openParticipants(owner);
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText(/connected|reconnecting/, { timeout: 15_000 });
  return context;
}

async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

async function turnCameraOn(page: Page): Promise<void> {
  const turnOn = page.getByRole('button', { name: 'Turn camera on' });
  if ((await turnOn.count()) > 0) await turnOn.click();
  await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0), { timeout: 8000 }).toBeGreaterThan(0);
}

async function forceActiveSpeaker(page: Page, name: string): Promise<void> {
  await page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === peerName);
    if (!peer || !window.__meetDebug?.forceActiveSpeakerForTest) throw new Error(`active speaker debug hook missing for ${peerName}`);
    window.__meetDebug.forceActiveSpeakerForTest(peer.id);
  }, name);
}

async function tileNames(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((elements) => elements.map((element) => element.textContent?.trim() ?? ''));
}

async function expectMirrored(locator: Locator, label: string): Promise<void> {
  const matrix = await transformMatrix(locator);
  expect(matrix.m11, `${label} should be horizontally mirrored (${matrix.transform})`).toBeLessThan(-0.99);
}

async function expectNotMirrored(locator: Locator, label: string): Promise<void> {
  const matrix = await transformMatrix(locator);
  expect(matrix.m11, `${label} should not be horizontally mirrored (${matrix.transform})`).toBeGreaterThan(0.99);
}

async function transformMatrix(locator: Locator): Promise<{ transform: string; m11: number; m22: number }> {
  return locator.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const matrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
    return { transform, m11: matrix.m11, m22: matrix.m22 };
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
          context.fillStyle = '#f8fafc';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#111827';
          context.font = '72px sans-serif';
          context.fillText('SCREEN TEXT ABC 123', 80, 140);
          context.fillStyle = '#ffffff';
          context.fillRect(80, 210, 1120, 360);
        }
        return canvas.captureStream();
      },
    });
  });
}
