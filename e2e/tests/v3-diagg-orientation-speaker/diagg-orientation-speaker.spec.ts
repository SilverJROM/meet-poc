import { expect, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const DIAGG_PREFIX = 'DIAGG';

test.describe.configure({ mode: 'serial' });

test.beforeEach(() => {
  cleanupRoomsByPrefix(DIAGG_PREFIX);
  cleanupRecordingsByPrefix(DIAGG_PREFIX);
});

test.afterEach(() => {
  cleanupRoomsByPrefix(DIAGG_PREFIX);
  cleanupRecordingsByPrefix(DIAGG_PREFIX);
});

test('DR-17/30 renders lobby/device previews true, mirrors only local self-view, and leaves remote tile unmirrored', async ({ browser, page, request }) => {
  const room = await createDiagRoom(request, 'orientation');
  await loginAsJrom(page);
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();

  await page.getByLabel('Start with camera on').check();
  await expectTrueOrientation(page.locator('app-lobby-preview video'), 'lobby self-preview');
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expectTrueOrientation(page.locator('app-device-dialog video'), 'device dialog preview');

  await page.locator('#display-name').fill('host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expectMirroredOrientation(page.locator('app-tile').filter({ hasText: 'host' }).locator('video'), 'local self-view tile');

  const { context } = await admitBrowserGuest(browser, page, room, 'guest-video');
  await expectTrueOrientation(page.locator('app-tile').filter({ hasText: 'guest-video' }).locator('video'), 'remote tile');
  await context.close();
});

test('DR-20/32 keeps speaking highlight live without changing gallery or share-strip order', async ({ browser, page, request }) => {
  test.setTimeout(60_000);
  await installFakeDisplayMedia(page);
  const room = await createDiagRoom(request, 'speaker-order');
  await loginAsJrom(page);
  await joinOwner(page, room, 'host');
  const guests: BrowserContext[] = [];
  guests.push((await admitBrowserGuest(browser, page, room, 'guest-a')).context);
  guests.push((await admitBrowserGuest(browser, page, room, 'guest-b')).context);

  await closeParticipants(page);
  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();
  await expect(page.locator('.share-strip .strip-list app-tile')).toHaveCount(3);
  const initialStripOrder = await stripNames(page);

  await forceActiveSpeaker(page, 'guest-a');
  await expect(page.locator('.share-strip app-tile').filter({ hasText: 'guest-a' }).locator('article.tile')).toHaveClass(/is-speaking/);
  await page.waitForTimeout(1_200);
  expect(await stripNames(page)).toEqual(initialStripOrder);

  await forceActiveSpeaker(page, 'guest-b');
  await expect(page.locator('.share-strip app-tile').filter({ hasText: 'guest-b' }).locator('article.tile')).toHaveClass(/is-speaking/);
  await page.waitForTimeout(1_200);
  expect(await stripNames(page)).toEqual(initialStripOrder);

  await page.getByRole('button', { name: 'Stop sharing screen' }).click();
  await expect(page.locator('.tiles-grid app-tile')).toHaveCount(3);
  const gridOrder = await gridNames(page);
  await forceActiveSpeaker(page, 'guest-a');
  await page.waitForTimeout(1_200);
  expect(await gridNames(page)).toEqual(gridOrder);

  for (const context of guests) await context.close();
});

async function createDiagRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${DIAGG_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<{ context: BrowserContext; page: Page }> {
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
  return { context, page: guest };
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

async function expectTrueOrientation(video: Locator, label: string): Promise<void> {
  await expect(video, `${label} video should render`).toBeVisible({ timeout: 15_000 });
  const matrix = await video.first().evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const domMatrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
    return { transform, m11: domMatrix.m11, m22: domMatrix.m22 };
  });
  expect(matrix.m11, `${label} must not flip horizontally (${matrix.transform})`).toBeGreaterThan(0.99);
  expect(matrix.m22, `${label} must not flip vertically (${matrix.transform})`).toBeGreaterThan(0.99);
}

async function expectMirroredOrientation(video: Locator, label: string): Promise<void> {
  await expect(video, `${label} video should render`).toBeVisible({ timeout: 15_000 });
  const matrix = await video.first().evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    const domMatrix = new DOMMatrixReadOnly(transform === 'none' ? undefined : transform);
    return { transform, m11: domMatrix.m11, m22: domMatrix.m22 };
  });
  expect(matrix.m11, `${label} must flip horizontally (${matrix.transform})`).toBeLessThan(-0.99);
  expect(matrix.m22, `${label} must not flip vertically (${matrix.transform})`).toBeGreaterThan(0.99);
}

async function forceActiveSpeaker(page: Page, name: string): Promise<void> {
  await page.evaluate((peerName) => {
    const debug = window.__meetDebug;
    const peer = debug?.peers.find((item) => item.name === peerName);
    if (!peer || !debug?.forceActiveSpeakerForTest) throw new Error(`active speaker debug hook missing for ${peerName}`);
    debug.forceActiveSpeakerForTest(peer.id);
  }, name);
}

async function stripNames(page: Page): Promise<string[]> {
  return page.locator('.share-strip .strip-list app-tile .name-label').evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() ?? ''),
  );
}

async function gridNames(page: Page): Promise<string[]> {
  return page.locator('.tiles-grid app-tile .name-label').evaluateAll((elements) => elements.map((element) => element.textContent?.trim() ?? ''));
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
        }
        return canvas.captureStream();
      },
    });
  });
}
