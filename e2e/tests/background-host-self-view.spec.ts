import { expect, test, type Page } from '@playwright/test';
import { loginAsJrom } from '../fixtures/auth';
import { cleanupRoomsByPrefix } from '../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../fixtures/rooms';

const ROOM_PREFIX = 'BG Host Self View';

test.describe.configure({ retries: 0 });
test.setTimeout(90_000);

test.beforeEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test.afterEach(() => {
  cleanupRoomsByPrefix(ROOM_PREFIX);
});

test('host local self-view uses composite track after blur is enabled in call', async ({ browser, page, request }) => {
  let room: TestRoom | null = null;
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();

  try {
    await clearBackgroundState(page);
    await clearBackgroundState(guest);
    await loginAsJrom(page);
    room = await createRoomViaApi(request, `${ROOM_PREFIX} ${Date.now()}`);

    await joinHostWithCamera(page, room);
    await joinGuestWithCamera(guest, room, 'Guest');
    await admitGuest(page, 'Guest');
    await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

    await waitForPublished(page);
    await waitForPublished(guest);
    await waitForGuestVideo(guest);

    const rawTrackId = await localRawTrackId(page);
    expect(rawTrackId).toBeTruthy();

    await page.getByRole('button', { name: 'Background effects' }).click();
    await page.locator('app-background-picker').getByRole('radio', { name: 'Blur' }).click();

    await expect
      .poll(() => localTrackSnapshot(page), { timeout: 35_000, intervals: [500, 1_000, 2_000] })
      .toMatchObject({
        tileUsesEffectiveTrack: true,
        tileUsesRawTrack: false,
      });

    const snapshot = await localTrackSnapshot(page);
    expect(snapshot.effectiveTrackId).toBeTruthy();
    expect(snapshot.effectiveTrackId).not.toBe(snapshot.rawTrackId);
    expect(snapshot.tileTrackId).toBe(snapshot.effectiveTrackId);
  } finally {
    await guestContext.close().catch(() => undefined);
    if (room) await request.delete(`/api/rooms/${room.id}`).catch(() => undefined);
    cleanupRoomsByPrefix(ROOM_PREFIX);
  }
});

async function clearBackgroundState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem('meet-poc:bg:selected');
    localStorage.removeItem('meet-poc:bg:mobile-opt-in');
  });
}

async function joinHostWithCamera(page: Page, room: TestRoom): Promise<void> {
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableLobbyCamera(page);
  await expect.poll(() => page.evaluate(() => !!window.__meetDebug?.localVideoTrackId), { timeout: 8_000 }).toBe(true);
  await page.locator('#display-name').fill('Host');
  await page.getByRole('button', { name: /Join/ }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
}

async function joinGuestWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=1');
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await enableLobbyCamera(page);
  await expect.poll(() => page.evaluate(() => !!window.__meetDebug?.localVideoTrackId), { timeout: 8_000 }).toBe(true);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible({ timeout: 10_000 });
}

async function enableLobbyCamera(page: Page): Promise<void> {
  await page
    .locator('label.toggle-row')
    .filter({ has: page.locator('input[name="cameraRequested"]') })
    .click();
  await expect(page.locator('label.toggle-row').filter({ hasText: 'Camera on' })).toBeVisible({ timeout: 8_000 });
}

async function admitGuest(page: Page, name: string): Promise<void> {
  const toastStack = page.locator('.knock-toast-stack');
  await expect(toastStack).toBeVisible({ timeout: 10_000 });
  await expect(toastStack.getByText(name)).toBeVisible();
  await toastStack.getByRole('button', { name: 'Admit' }).click();
}

async function waitForPublished(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.sfuPublishState?.status), { timeout: 35_000 }).toBe('published');
}

async function waitForGuestVideo(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const streams = window.__meetDebug?.sfuRemoteStreams;
          if (!streams) return 0;
          return [...streams.values()].filter((stream) => stream.getVideoTracks().some((track) => track.readyState === 'live')).length;
        }),
      { timeout: 35_000 },
    )
    .toBeGreaterThan(0);
}

async function localRawTrackId(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.id ?? null);
}

type LocalTrackSnapshot = {
  rawTrackId: string | null;
  effectiveTrackId: string | null;
  tileTrackId: string | null;
  tileUsesRawTrack: boolean;
  tileUsesEffectiveTrack: boolean;
};

async function localTrackSnapshot(page: Page): Promise<LocalTrackSnapshot> {
  return page.evaluate(() => {
    const debug = window.__meetDebug;
    const myClientId = debug?.myClientId ?? null;
    const rawTrackId = debug?.localStream?.getVideoTracks()[0]?.id ?? null;
    const effectiveTrackId = debug?.effectiveLocalStream?.getVideoTracks()[0]?.id ?? null;
    const localArticle = myClientId
      ? document.querySelector<HTMLElement>(`app-tile article[data-peer="${CSS.escape(myClientId)}"]`)
      : null;
    const video = localArticle?.querySelector<HTMLVideoElement>('video') ?? null;
    const tileStream = video?.srcObject instanceof MediaStream ? video.srcObject : null;
    const tileTrackId = tileStream?.getVideoTracks()[0]?.id ?? null;

    return {
      rawTrackId,
      effectiveTrackId,
      tileTrackId,
      tileUsesRawTrack: !!tileTrackId && tileTrackId === rawTrackId,
      tileUsesEffectiveTrack: !!tileTrackId && tileTrackId === effectiveTrackId && effectiveTrackId !== rawTrackId,
    };
  });
}
