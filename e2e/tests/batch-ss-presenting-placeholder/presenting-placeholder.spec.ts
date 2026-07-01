import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'BATCHSS';
const SCREENSHOT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-SS/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
});

test('R7 local presenter sees a "You\'re presenting" placeholder, remote guest still sees the live share', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(45_000);
  await installFakeDisplayMedia(page);
  const room = await createRoomViaApi(request, `${PREFIX} placeholder ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'host');

  // Reproduce-first: before sharing, the host's own view has no share-stage at all.
  await expect(page.locator('.share-stage')).toHaveCount(0);

  await page.getByRole('button', { name: 'Share screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toBeVisible();

  // R7a — local presenter: no self-mirror. Placeholder shown, no video/app-tile in the main stage.
  await expect(page.locator('.share-stage .presenting-placeholder')).toBeVisible();
  await expect(page.locator('.share-stage .presenting-placeholder')).toContainText("You're presenting");
  await expect(page.locator('.share-stage app-tile')).toHaveCount(0);
  await expect(page.locator('.share-stage video')).toHaveCount(0);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/presenter-placeholder.png`, fullPage: true });

  // R7b — remote guest is unaffected: joining while the share is already live exercises the
  // SFU's initial-roster subscribe path (deterministic — see sfu-client.service.ts
  // handleSfuRoster), so the guest sees the presenter's live shared screen immediately on join.
  const guest = await admitBrowserGuest(browser, page, room, 'guest-a');
  await expect(guest.locator('.call-panel.share-layout')).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator('.share-stage app-tile video')).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator('.share-stage .presenting-placeholder')).toHaveCount(0);
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/remote-sees-share.png`, fullPage: true });

  // R7c — clean toggle: stopping share returns the presenter's own view to the normal grid.
  await page.getByRole('button', { name: 'Stop sharing screen' }).click();
  await expect(page.locator('.call-panel.share-layout')).toHaveCount(0);
  await expect(page.locator('.tiles-grid app-tile')).toHaveCount(2);

  await guest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(room.url + '?sfu=0');
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill(name);
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await admitWaiting(owner, name);
  await expect(guest.locator('.call-panel')).toBeVisible();
  return guest;
}

async function admitWaiting(owner: Page, name: string): Promise<void> {
  // Admit directly from the knock toast (top-right) rather than opening the participant
  // sidebar — out of scope for R7, but the toast stack visually overlaps the
  // "Show participants" corner button, so this is the reliable path for this spec.
  const toast = owner.locator('.knock-toast').filter({ hasText: name });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Admit' }).click();
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
        const stream = canvas.captureStream(15);
        // A static (never-redrawn) canvas emits a single frame and then goes quiet, which is
        // enough for a same-page <video> to show but not enough for the SFU to actually relay
        // a decodable stream to a remote subscriber — keep repainting so real frames flow.
        let tick = 0;
        const draw = () => {
          if (!context) return;
          tick += 1;
          context.fillStyle = '#e5f0ff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1e3a8a';
          context.font = '72px sans-serif';
          context.fillText('Shared screen', 80, 140);
          context.fillStyle = '#0f172a';
          context.font = '32px sans-serif';
          context.fillText(String(tick), 80, 220);
        };
        draw();
        const interval = setInterval(draw, 200);
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(interval));
        return stream;
      },
    });
  });
}
