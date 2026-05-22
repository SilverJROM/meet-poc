import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, createRoomViaApi, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const DIAGE2_PREFIX = 'DIAGE2';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diage2/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGE2_PREFIX);
  cleanupRecordingsByPrefix(DIAGE2_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGE2_PREFIX);
  cleanupRecordingsByPrefix(DIAGE2_PREFIX);
});

test('DR-16 closed room shows timed wait and host open transitions guest into admit flow', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGE2_PREFIX} closed wait ${Date.now()}`, { open: false });
  await request.put(`/api/rooms/${room.id}/access`, { data: { isOpen: false, waitTimeoutMinutes: 0.05 } });

  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill('closed-guest');
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText("This room hasn't been opened by the host yet.")).toBeVisible();
  await expect(page.getByRole('timer')).toContainText(/s remaining/);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/room-closed-waiting.png`, fullPage: true });

  const host = await page.context().newPage();
  await loginAsJrom(host);
  await host.goto('/app/rooms');
  const row = host.locator('.room-row').filter({ hasText: room.title }).first();
  await expect(row).toContainText('Closed to guests');
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(row).toContainText('Open for guests');
  await host.screenshot({ path: `${SCREENSHOT_DIR}/host-open-toggle.png`, fullPage: true });

  await expect(page.getByText('The host is available — please wait to be admitted.')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState), { timeout: 5000 }).toBe('knocking');
  await page.waitForTimeout(1500);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState), { timeout: 1000 }).toBe('knocking');
  await host.close();
});

test('DR-16 open room waits without timeout and uses the normal admit flow', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGE2_PREFIX} open admit ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'open-guest');
  await expect(guest.getByText('The host is available — please wait to be admitted.')).toBeVisible();
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/room-open-admit.png`, fullPage: true });

  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'open-guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();

  await guestContext.close();
});
