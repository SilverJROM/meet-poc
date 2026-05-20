import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRoomViaApi, createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { addKnocker, admitBrowserGuest, openParticipants } from '../v2-b8-sidebar/helpers';

const DIAGB1_PREFIX = 'DIAGB1';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagb1/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGB1_PREFIX);
  cleanupRecordingsByPrefix(DIAGB1_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGB1_PREFIX);
  cleanupRecordingsByPrefix(DIAGB1_PREFIX);
});

test('DR-6 quick-join is default and FIXC2 device dialog is opt-in', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGB1_PREFIX} quick join ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url);

  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await expect(page.locator('app-lobby-preview .lobby-preview.compact')).toBeVisible();
  await expect(page.locator('app-device-dialog')).toHaveCount(0);
  await expect(page.locator('.mic-select')).toHaveCount(0);
  await expect(page.getByLabel('Microphone on')).toBeVisible();
  await expect(page.getByLabel('Start with camera on')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/quick-join.png`, fullPage: true });

  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expect(page.locator('app-device-dialog .device-dialog')).toBeVisible();
  await expect(page.locator('app-device-dialog .mic-select')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/quick-join-expanded.png`, fullPage: true });
});

test('DR-7 empty display name shows inline error and focuses the field', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGB1_PREFIX} empty name ${Date.now()}`);
  await page.goto(room.url);
  await page.getByRole('button', { name: 'Ask to join' }).click();

  await expect(page.getByText('Enter your name to join')).toBeVisible();
  await expect(page.locator('#display-name')).toBeFocused();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/empty-name-error.png`, fullPage: true });
});

test('DR-7 permission denial surfaces clear setup copy', async ({ page, request }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
      },
    });
  });
  const room = await createRoomViaApi(request, `${DIAGB1_PREFIX} permission ${Date.now()}`);
  await page.goto(room.url);

  await expect(page.getByText('Microphone access denied')).toBeVisible();
  await expect(page.getByText(/allow microphone access/i)).toBeVisible();
});

test('DR-9/DR-10 host sees late knockers live and gets one doorbell only for the new knock', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGB1_PREFIX} live knocker ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  const { guest, context } = await admitBrowserGuest(browser, page, room, 'guest-admitted');
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    if (window.__meetDebug) window.__meetDebug.doorbellCount = 0;
  });
  await guest.evaluate(() => {
    if (window.__meetDebug) window.__meetDebug.doorbellCount = 0;
  });

  const knocker = await addKnocker(browser, room, 'guest-waiting-live');

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.waitingKnockers?.map((item) => item.name) || []), { timeout: 5000 }).toContain(
    'guest-waiting-live',
  );
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.doorbellCount || 0), { timeout: 5000 }).toBe(1);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.doorbellCount || 0), { timeout: 3000 }).toBe(0);
  await openParticipants(page);
  await expect(page.getByLabel('Waiting to join').getByText('guest-waiting-live')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/live-knocker.png`, fullPage: true });

  await knocker.context.close();
  await context.close();
});

test('DR-10 initial pending-list snapshot does not ring for already-waiting knockers', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGB1_PREFIX} snapshot no ring ${Date.now()}`);
  const knocker = await addKnocker(browser, room, 'guest-before-host');

  await joinOwnerCall(page, room, 'host');

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.waitingKnockers?.map((item) => item.name) || []), { timeout: 5000 }).toContain(
    'guest-before-host',
  );
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.doorbellCount || 0), { timeout: 3000 }).toBe(0);

  await knocker.context.close();
});
