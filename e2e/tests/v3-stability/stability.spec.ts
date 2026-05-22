import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const STABILITY_PREFIX = 'STABILITY';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-stability/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(STABILITY_PREFIX);
  cleanupRecordingsByPrefix(STABILITY_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(STABILITY_PREFIX);
  cleanupRecordingsByPrefix(STABILITY_PREFIX);
});

test('DR-40 signaling reconnect resyncs room state without re-admit', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${STABILITY_PREFIX} ws ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-ws');

  const before = await remotePeerByName(page, 'guest-ws');
  const attemptsBefore = await guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  const resyncBefore = await guest.evaluate(() => window.__meetDebug?.wsResyncCount || 0);

  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());

  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsResyncCount || 0), { timeout: 10000 }).toBeGreaterThan(resyncBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect(page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-ws' })).toHaveCount(0);
  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 10000 }).toBe(1);

  await guestContext.close();
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.getByRole('button', { name: 'Show participants' }).click();
  await owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText(/connected|new|connecting/, { timeout: 15_000 });
}

async function remotePeerByName(page: Page, name: string): Promise<{ id: string; participantId: string; reconnecting: boolean } | null> {
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === peerName);
    return peer ? { id: peer.id, participantId: peer.participantId, reconnecting: peer.reconnecting } : null;
  }, name);
}

async function remotePeerCountByParticipant(page: Page, participantId: string): Promise<number> {
  return page.evaluate((id) => window.__meetDebug?.peers.filter((peer) => peer.participantId === id && !peer.name.includes('(you)')).length || 0, participantId);
}
