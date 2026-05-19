import { expect, test } from '@playwright/test';
import { admitBrowserGuest, cleanupMb2Artifacts, createMb2Room, joinOwnerWithCamera, prepareMb2Evidence } from './helpers';

test.beforeAll(() => {
  prepareMb2Evidence();
  cleanupMb2Artifacts();
});

test.afterAll(() => {
  cleanupMb2Artifacts();
});

test('S5.4 mobile background visibility pauses local video and broadcasts media-state', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createMb2Room(page, 'background-mobile');
  await joinOwnerWithCamera(page, room);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled)).toBe(true);

  const guest = await admitBrowserGuest(browser, page, room, 'observer');
  try {
    await setVisibility(page, 'hidden');
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled), { timeout: 1000 }).toBe(false);
    await expect.poll(() => peerCameraState(guest, 'host')).toBe(false);

    await setVisibility(page, 'visible');
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled), { timeout: 1000 }).toBe(true);
    await expect.poll(() => peerCameraState(guest, 'host')).toBe(true);
  } finally {
    await guest.context().close();
  }
});

async function setVisibility(page: import('@playwright/test').Page, visibilityState: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visibilityState);
}

async function peerCameraState(page: import('@playwright/test').Page, name: string): Promise<boolean | undefined> {
  return page.evaluate((peerName) => window.__meetDebug?.peers.find((peer) => peer.name === peerName)?.camEnabled, name);
}
