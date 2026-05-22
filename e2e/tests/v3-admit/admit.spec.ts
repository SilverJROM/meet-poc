import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const ADMIT_PREFIX = 'ADMIT';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-admit/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(ADMIT_PREFIX);
  cleanupRecordingsByPrefix(ADMIT_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(ADMIT_PREFIX);
  cleanupRecordingsByPrefix(ADMIT_PREFIX);
});

test('DR-39 reload is a drop: keeps one reconnecting card and rejoins without host re-admit', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${ADMIT_PREFIX} reload ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-reload');

  const before = await remotePeerByName(page, 'guest-reload');
  expect(before?.participantId).toBeTruthy();

  await guest.reload({ waitUntil: 'domcontentloaded' });
  const reconnectingTile = page.locator('app-tile').filter({ hasText: 'guest-reload' });
  await expect(reconnectingTile).toHaveCount(1);
  await expect(reconnectingTile.locator('.state')).toHaveText('Reconnecting…');

  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill('guest-reload');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-reload' })).toHaveCount(0);
  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 10000 }).toBe(1);
  const after = await remotePeerByParticipant(page, before!.participantId);
  expect(after?.reconnecting).toBe(false);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/reload-drop-auto-admit.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await guestContext.close();
});

test('DR-38 explicit Exit removes the card and requires re-admit, then later drops auto-resume', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${ADMIT_PREFIX} exit ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndAdmit(page, guest, room, 'guest-exit');

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await expect.poll(() => peerCountByName(page, 'guest-exit'), { timeout: 10000 }).toBe(0);
  await expect(page.locator('app-tile').filter({ hasText: 'guest-exit' })).toHaveCount(0);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/explicit-exit-card-removed.png`, fullPage: true });

  await guest.goto(room.url + '?sfu=0');
  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill('guest-exit');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  await expect(guest.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();

  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-exit' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  const admittedAgain = await remotePeerByName(page, 'guest-exit');
  expect(admittedAgain?.participantId).toBeTruthy();

  const attemptsBefore = await guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0);
  await guest.evaluate(() => window.__meetDebug?.closeSignalingForTest?.());
  const guestTile = page.locator('app-tile').filter({ hasText: 'guest-exit' });
  await expect(guestTile).toHaveCount(1);
  await expect(guestTile.locator('.state')).toHaveText('Reconnecting…');
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.wsReconnectAttempts || 0), { timeout: 8000 }).toBeGreaterThan(attemptsBefore);
  await expect.poll(() => guest.evaluate(() => window.__meetDebug?.roomState), { timeout: 10000 }).toBe('in-call');
  await expect(page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-exit' })).toHaveCount(0);
  await expect.poll(() => remotePeerCountByParticipant(page, admittedAgain!.participantId), { timeout: 10000 }).toBe(1);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/post-readmit-drop-auto-resume.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await guestContext.close();
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.getByRole('button', { name: 'Show participants' }).click();
  await owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name })).toHaveCount(1);
}

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

async function peerCountByName(page: Page, name: string): Promise<number> {
  return page.evaluate((peerName) => window.__meetDebug?.peers.filter((peer) => peer.name === peerName).length || 0, name);
}
