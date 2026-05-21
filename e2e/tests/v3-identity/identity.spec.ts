import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

const IDENTITY_PREFIX = 'IDENTITY';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-identity/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(IDENTITY_PREFIX);
  cleanupRecordingsByPrefix(IDENTITY_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(IDENTITY_PREFIX);
  cleanupRecordingsByPrefix(IDENTITY_PREFIX);
});

test('DR-37 full reload rejoin keeps the same participant identity', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `${IDENTITY_PREFIX} reload ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-identity');
  await page.getByRole('button', { name: 'Show participants' }).click();
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-identity' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);

  const before = await remotePeerByName(page, 'guest-identity');
  expect(before?.participantId).toBeTruthy();
  const firstClientKey = await guest.evaluate(() => window.localStorage.getItem('meet-poc.clientKey'));
  expect(firstClientKey).toBeTruthy();

  await guest.evaluate(() => window.sessionStorage.clear());
  await guest.goto(room.url);
  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 8000 }).toBe(0);

  await expect(guest.getByRole('heading', { name: room.title })).toBeVisible();
  await guest.locator('#display-name').fill('guest-identity');
  await guest.getByRole('button', { name: 'Ask to join' }).click();
  const secondClientKey = await guest.evaluate(() => window.localStorage.getItem('meet-poc.clientKey'));
  expect(secondClientKey).toBe(firstClientKey);

  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-identity' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect.poll(() => remotePeerCountByParticipant(page, before!.participantId), { timeout: 10000 }).toBe(1);
  const after = await remotePeerByParticipant(page, before!.participantId);
  expect(after?.id).toBeTruthy();
  expect(after?.id).not.toBe(before?.id);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/reload-rejoin-same-identity.png`, fullPage: true });

  await guest.getByRole('button', { name: 'Leave call' }).click();
  await guestContext.close();
});

async function remotePeerByName(page: Page, name: string): Promise<{ id: string; participantId: string } | null> {
  return page.evaluate((peerName) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.name === peerName);
    return peer ? { id: peer.id, participantId: peer.participantId } : null;
  }, name);
}

async function remotePeerByParticipant(page: Page, participantId: string): Promise<{ id: string; participantId: string } | null> {
  return page.evaluate((id) => {
    const peer = window.__meetDebug?.peers.find((candidate) => candidate.participantId === id && !candidate.name.includes('(you)'));
    return peer ? { id: peer.id, participantId: peer.participantId } : null;
  }, participantId);
}

async function remotePeerCountByParticipant(page: Page, participantId: string): Promise<number> {
  return page.evaluate((id) => window.__meetDebug?.peers.filter((peer) => peer.participantId === id && !peer.name.includes('(you)')).length || 0, participantId);
}
