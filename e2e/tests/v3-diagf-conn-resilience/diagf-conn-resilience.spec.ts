import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const DIAGF_PREFIX = 'DIAGF';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagf/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGF_PREFIX);
  cleanupRecordingsByPrefix(DIAGF_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGF_PREFIX);
  cleanupRecordingsByPrefix(DIAGF_PREFIX);
});

test('DR-18/19/21 admitted peers and owners resume silently without duplicate or ghost tiles', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGF_PREFIX} reconnect ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-resume');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-resume' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-resume' })).toHaveCount(1);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.reconnectTokenPresent || false), { timeout: 8000 }).toBe(true);

  const guestAttemptsBefore = await guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  const guestClientIdBefore = await guest.evaluate(() => window.__meetDebug?.myClientId || '');
  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(guestAttemptsBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsConnected || false), { timeout: 10000 }).toBe(true);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect.poll(() => guest.evaluate((oldId) => window.__meetDebug?.myClientId !== oldId, guestClientIdBefore), { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.filter((peer) => peer.name === 'guest-resume').length || 0), { timeout: 10000 }).toBe(1);
  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-resume' })).toHaveCount(1);

  const ownerAttemptsBefore = await page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  const ownerClientIdBefore = await page.evaluate(() => window.__meetDebug?.myClientId || '');
  await page.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(ownerAttemptsBefore);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsConnected || false), { timeout: 10000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect.poll(() => page.evaluate((oldId) => window.__meetDebug?.myClientId !== oldId, ownerClientIdBefore), { timeout: 10000 }).toBe(true);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.peers.filter((peer) => peer.name === 'host').length || 0), { timeout: 10000 }).toBe(1);
  await expect(page.getByText('Asking the host to admit you...')).toHaveCount(0);
  await expect(page.locator('app-tile')).toHaveCount(2);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/reconnect-no-ghost.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.peers.filter((peer) => peer.name === 'guest-resume').length || 0), { timeout: 10000 }).toBe(0);
  await expect(page.locator('app-tile')).toHaveCount(1);

  await guestContext.close();
});

test('DR-22 transient recovering state keeps the tile and recovers without teardown', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${DIAGF_PREFIX} recovering ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-grace');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-grace' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);

  const guestPeerId = await page.evaluate(() => window.__meetDebug?.peers.find((peer) => peer.name === 'guest-grace')?.id || '');
  expect(guestPeerId).toBeTruthy();
  await page.evaluate((peerId) => window.__meetDebug?.markPeerReconnectingForTest?.(peerId), guestPeerId);

  const guestTile = page.locator('app-tile').filter({ hasText: 'guest-grace' });
  await expect(guestTile.locator('.state')).toHaveText('disconnected');
  await expect(guestTile.locator('.quality-pill')).toHaveText('weak');
  await expect(page.locator('app-tile')).toHaveCount(2);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/grace-recovering.png`, fullPage: true });

  await page.evaluate((peerId) => window.__meetDebug?.markPeerRecoveredForTest?.(peerId), guestPeerId);
  await expect(guestTile.locator('.state')).toHaveText('connected');
  await expect(guestTile.locator('.quality-pill')).toHaveText('good');
  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.roomState)).toBe('in-call');

  await guestContext.close();
});
