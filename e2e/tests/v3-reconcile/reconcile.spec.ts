import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const RECONCILE_PREFIX = 'RECONCILE';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-reconcile/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(RECONCILE_PREFIX);
  cleanupRecordingsByPrefix(RECONCILE_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(RECONCILE_PREFIX);
  cleanupRecordingsByPrefix(RECONCILE_PREFIX);
});

test('DR-31 guest reconnect resumes the same participant tile without re-admit or ghost duplicates', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${RECONCILE_PREFIX} guest ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0), { timeout: 8000 }).toBeGreaterThan(0);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-reconcile');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-reconcile' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);

  const before = await remotePeerByName(page, 'guest-reconcile');
  expect(before?.id).toBeTruthy();
  expect(before?.participantId).toBeTruthy();

  const attemptsBefore = await guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  const guestTile = page.locator('app-tile').filter({ hasText: 'guest-reconcile' });
  await expect(guestTile).toHaveCount(1);
  await expect(guestTile.locator('.state')).toHaveText('Reconnecting…');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/guest-reconnecting-same-tile.png`, fullPage: true });

  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsConnected || false), { timeout: 10000 }).toBe(true);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');

  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 10000 }).toBe(1);
  const after = await remotePeerByParticipant(page, before!.participantId);
  expect(after?.id).toBeTruthy();
  expect(after?.id).not.toBe(before?.id);
  expect(after?.reconnecting).toBe(false);
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toHaveCount(0);
  await expect(page.locator('app-tile')).toHaveCount(2);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/guest-resumed-no-ghost.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await guestContext.close();
});

test('DR-31 owner reconnect resumes for guests without spawning owner ghost tiles', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${RECONCILE_PREFIX} owner ${Date.now()}`);
  await joinOwnerCall(page, room, 'host-reconcile');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(guest.locator('app-tile')).toHaveCount(2);

  const before = await remotePeerByName(guest, 'host-reconcile');
  expect(before?.id).toBeTruthy();
  expect(before?.participantId).toBeTruthy();
  const attemptsBefore = await page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);

  await page.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  const hostTile = guest.locator('app-tile').filter({ hasText: 'host-reconcile' });
  await expect(hostTile).toHaveCount(1);
  await expect(hostTile.locator('.state')).toHaveText('Reconnecting…');
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/owner-reconnecting-same-tile.png`, fullPage: true });

  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.wsConnected || false), { timeout: 10000 }).toBe(true);
  await expect.poll(() => remotePeerCountByParticipant(guest, before!.participantId), { timeout: 10000 }).toBe(1);
  const after = await remotePeerByParticipant(guest, before!.participantId);
  expect(after?.id).not.toBe(before?.id);
  expect(after?.reconnecting).toBe(false);
  await expect(guest.locator('app-tile')).toHaveCount(2);
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/owner-resumed-no-ghost.png`, fullPage: true });

  await guestContext.close();
});

async function remotePeerByName(page: Page, name: string): Promise<{ id: string; participantId: string; reconnecting: boolean } | null> {
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === peerName);
    return peer ? { id: peer.id, participantId: peer.participantId, reconnecting: peer.reconnecting } : null;
  }, name);
}

async function remotePeerByParticipant(page: Page, participantId: string): Promise<{ id: string; participantId: string; reconnecting: boolean } | null> {
  return page.evaluate((id) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.participantId === id && !candidate.name.includes('(you)'));
    return peer ? { id: peer.id, participantId: peer.participantId, reconnecting: peer.reconnecting } : null;
  }, participantId);
}

async function remotePeerCountByParticipant(page: Page, participantId: string): Promise<number> {
  return page.evaluate((id) => window.__meetDebug?.peers.filter((peer) => peer.participantId === id && !peer.name.includes('(you)')).length || 0, participantId);
}

