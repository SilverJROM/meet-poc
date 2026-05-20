import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const MUI_PREFIX = 'MUI26';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-mui/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupMUIArtifacts();
});

test.afterAll(() => {
  cleanupMUIArtifacts();
});

test('DR-26 Meet-like control bar keeps every existing control wired', async ({ page }) => {
  await installFakeDisplayMedia(page);
  const room = await createAndJoinOwner(page, 'controls');

  const bar = page.locator('app-controls-bar .controls-bar');
  await expect(bar).toBeVisible();
  await expect(page.locator('.meeting-corner-left')).toContainText(room.title);
  await expect(page.locator('.meeting-clock')).toContainText(/^\d+:\d{2}$/);
  await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByLabel('Meeting chat')).toBeVisible();
  await page.getByRole('button', { name: 'Hide chat' }).click();

  const mic = page.getByRole('button', { name: 'Mute microphone' });
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  await mic.click();
  await expect(page.getByRole('button', { name: 'Unmute microphone' })).toHaveClass(/is-off/);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled)).toBe(false);

  await turnCameraOn(page);
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(page.getByRole('button', { name: 'Turn camera on' })).toHaveClass(/is-off/);
  await expect(page.locator('app-tile').filter({ hasText: 'host' }).locator('.camera-off-avatar')).toBeVisible();

  await page.getByRole('button', { name: 'Device settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Check your camera and audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Close device settings' }).click();

  await page.getByRole('button', { name: 'Enable audio-only mode' }).click();
  await expect(page.locator('.weak-connection-banner')).toContainText('Audio-only mode is on');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.manualAudioOnly)).toBe(true);

  await page.getByRole('button', { name: 'Show connection diagnostics' }).click();
  await expect(page.locator('.diagnostics-panel')).toBeVisible();
  await page.getByLabel('Force relay').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.forceRelay)).toBe(true);

  await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
  await page.getByRole('button', { name: 'Hide participants' }).click();

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.screenShareAttempts)).toBe(1);
  await page.getByRole('button', { name: 'Stop sharing screen' }).click();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/call-controls.png`, fullPage: true });

  await page.getByRole('button', { name: 'Leave call' }).click();
  await expect(page.getByRole('heading', { name: 'Leave meeting' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave but keep meeting going' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
});

test('DR-26 tile states show mute, camera-off avatar, and active-speaker outline', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'tile-states');
  const guest = await admitBrowserGuest(browser, page, room, 'speaker');
  await closeParticipants(page);

  await page.getByRole('button', { name: 'Mute microphone' }).click();
  await turnCameraOn(page);
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  const hostTile = page.locator('app-tile').filter({ hasText: 'host' });
  await expect(hostTile.locator('.mute-icon')).toBeVisible();
  await expect(hostTile.locator('.camera-off-avatar')).toContainText('H');

  await activateActiveSpeaker(page, 'speaker');
  const speakerTile = page.locator('app-tile').filter({ hasText: 'speaker' }).locator('article.tile');
  await expect(speakerTile).toHaveClass(/is-speaking/, { timeout: 10000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/tiles-states.png`, fullPage: true });

  await guest.context().close();
});

test('DR-26 share layout keeps presenter large with participant strip', async ({ browser, page }) => {
  await installFakeDisplayMedia(page);
  const room = await createAndJoinOwner(page, 'share-layout');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-a');
  await closeParticipants(page);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect(page.locator('.share-stage app-tile')).toHaveCount(1);
  await expect(page.locator('.share-strip .strip-list app-tile')).toHaveCount(2);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/share-layout.png`, fullPage: true });

  await guest.context().close();
});

test('DR-26 narrow mobile bar keeps primary controls reachable by horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await createAndJoinOwner(page, 'mobile-reachability');

  const controls = page.locator('app-controls-bar .controls');
  await expect(controls).toBeVisible();
  await expect.poll(() => controls.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

  for (const name of [
    /^Mute microphone$/,
    /^Turn camera (on|off)$/,
    /^Share screen$/,
    /^Device settings$/,
    /^Enable audio-only mode$/,
    /^Show connection diagnostics$/,
    /^Leave call$/,
  ]) {
    const button = page.getByRole('button', { name });
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
  }
});

async function createAndJoinOwner(page: Page, suffix: string): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${MUI_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  return room;
}

async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await openParticipants(owner);
  const waitingTab = owner.getByRole('tab', { name: 'Waiting' });
  if ((await waitingTab.count()) > 0) await waitingTab.click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText('connected', { timeout: 12000 });
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
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toHaveCount(0);
}

async function activateActiveSpeaker(page: Page, peerName: string): Promise<void> {
  await page.evaluate((name) => {
    const peer = window.__meetDebug?.peers.find((item) => item.name === name);
    if (!peer || !window.__meetDebug?.forceActiveSpeakerForTest) throw new Error('active speaker debug hook missing');
    window.__meetDebug.forceActiveSpeakerForTest(peer.id);
  }, peerName);
}

async function turnCameraOn(page: Page): Promise<void> {
  const turnOn = page.getByRole('button', { name: 'Turn camera on' });
  if ((await turnOn.count()) > 0) await turnOn.click();
  await expect(page.getByRole('button', { name: 'Turn camera off' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(true);
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
          context.fillStyle = '#e8eef8';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1f2937';
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

function cleanupMUIArtifacts(): void {
  cleanupRoomsByPrefix(MUI_PREFIX);
  cleanupRecordingsByPrefix(MUI_PREFIX);
}
