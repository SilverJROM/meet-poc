import { expect, test, type Page } from '@playwright/test';
import { B7_SCREENSHOT_DIR, admitBrowserGuest, cleanupB7Artifacts, createAndJoinOwner, createApiRoom, prepareB7Evidence } from './helpers';
import { createRoomFromDashboard } from '../../fixtures/rooms';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareB7Evidence();
  cleanupB7Artifacts();
});

test.afterAll(() => {
  cleanupB7Artifacts();
});

test('S7.1/S7.2 renders Record for host and keeps it out of the guest DOM', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'host-only-record');
  const guest = await admitBrowserGuest(browser, page, room, 'guest');

  await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Record' })).toHaveCount(0);
  await page.screenshot({ path: `${B7_SCREENSHOT_DIR}/host-controls-record-visible.png`, fullPage: true });
  await guest.screenshot({ path: `${B7_SCREENSHOT_DIR}/non-host-controls-no-record.png`, fullPage: true });
  await guest.context().close();
});

test('S7.3 shows Host is recording banner to host and guest with advancing duration', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'recording-banner');
  const guest = await admitBrowserGuest(browser, page, room, 'guest');

  await page.getByRole('button', { name: 'Record' }).click();
  const hostBanner = page.locator('app-recording-banner').filter({ hasText: 'Host is recording' });
  const guestBanner = guest.locator('app-recording-banner').filter({ hasText: 'Host is recording' });
  await expect(hostBanner).toBeVisible();
  await expect(guestBanner).toBeVisible();
  await expect.poll(async () => hostBanner.locator('.duration').textContent()).toMatch(/^0:0[1-5]$/);
  await expect.poll(async () => guestBanner.locator('.duration').textContent()).toMatch(/^0:0[1-5]$/);
  await page.screenshot({ path: `${B7_SCREENSHOT_DIR}/recording-banner-visible.png`, fullPage: true });

  const upload = page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST');
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await upload;
  await expect(hostBanner).toHaveCount(0);
  await expect(guestBanner).toHaveCount(0);
  await guest.context().close();
});

test('S7.4 shows polished permission-denied lobby copy and Retry re-runs preflight', async ({ page, request }) => {
  await page.addInitScript(() => {
    let calls = 0;
    Object.defineProperty(window, '__gumCalls', { configurable: true, get: () => calls });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          calls += 1;
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
        enumerateDevices: async () => [],
      },
    });
  });
  const room = await createApiRoom(request, 'permission-denied');
  await page.goto(room.url + '?sfu=0');

  await expect(page.getByRole('heading', { name: 'Microphone access denied' })).toBeVisible();
  await expect(page.getByText('allow microphone access for')).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls);
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls)).toBeGreaterThan(before);
  await page.screenshot({ path: `${B7_SCREENSHOT_DIR}/permission-denied-polished.png`, fullPage: true });
});

test('S7.4 shows no-devices lobby copy without a Retry button', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          throw new DOMException('No device found', 'NotFoundError');
        },
        enumerateDevices: async () => [],
      },
    });
  });
  const room = await createApiRoom(request, 'no-devices');
  await page.goto(room.url + '?sfu=0');

  await expect(page.getByRole('heading', { name: 'No microphone detected' })).toBeVisible();
  await expect(page.getByText('Please connect a microphone and refresh the page.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.screenshot({ path: `${B7_SCREENSHOT_DIR}/no-devices-polished.png`, fullPage: true });
});

test('S7.5 icon-state controls expose aria-pressed and flip with mic state', async ({ page }) => {
  await createAndJoinOwner(page, 'aria-pressed');

  const mute = page.getByRole('button', { name: 'Mute microphone' });
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  const unmute = page.getByRole('button', { name: 'Unmute microphone' });
  await expect(unmute).toHaveAttribute('aria-pressed', 'false');
  await unmute.click();
  await expect(page.getByRole('button', { name: 'Mute microphone' })).toHaveAttribute('aria-pressed', 'true');
});

test('S7.5 local camera-off in call renders the initials avatar', async ({ page }) => {
  const room = await createAndJoinOwnerWithLobbyControl(page, 'self-camera-avatar');

  await expect(page.locator('app-tile').filter({ hasText: 'host' }).locator('video')).toBeVisible();
  await page.getByRole('button', { name: 'Turn camera off' }).click();
  const localAvatar = page.locator('app-tile').filter({ hasText: 'host' }).locator('.camera-off-avatar');
  await expect(localAvatar).toBeVisible();
  await expect(localAvatar).toContainText('H');
  await page.screenshot({ path: `${B7_SCREENSHOT_DIR}/self-camera-off-avatar.png`, fullPage: true });

  expect(room.id).toMatch(/^[a-f0-9]{12}$/);
});

async function createAndJoinOwnerWithLobbyControl(page: Page, suffix: string) {
  const room = await createRoomFromDashboard(page, `B7CTRL ${suffix} ${Date.now()}`);
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill('host');
  await page.getByLabel('Start with camera on').check();
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(1);
  return room;
}
