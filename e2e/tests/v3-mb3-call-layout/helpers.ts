import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

export const MB3_PREFIX = 'MB3LAYOUT';
export const MB3_SCREENSHOT_DIR = '../plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-3/screenshots';

export function prepareMb3Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), MB3_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupMb3Artifacts(): void {
  cleanupRoomsByPrefix(MB3_PREFIX);
  cleanupRecordingsByPrefix(MB3_PREFIX);
}

export async function createMb3Room(page: Page, suffix: string): Promise<TestRoom> {
  return createRoomFromDashboard(page, `${MB3_PREFIX} ${suffix} ${Date.now()}`);
}

export async function createAndJoinOwner(page: Page, suffix: string, name = 'host'): Promise<TestRoom> {
  const room = await createMb3Room(page, suffix);
  await joinOwnerCall(page, room, name);
  return room;
}

export async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name = 'guest'): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await openParticipants(owner);
  const waitingTab = owner.getByRole('tab', { name: 'Waiting' });
  if ((await waitingTab.count()) > 0) await waitingTab.click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  const expectedTiles = (await owner.locator('app-tile').count()) + 1;
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile')).toHaveCount(expectedTiles);
  const participantsTab = owner.getByRole('tab', { name: 'In the call' });
  if ((await participantsTab.count()) > 0) await participantsTab.click();
  const mobileSheet = owner.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open');
  if (await mobileSheet.isVisible().catch(() => false)) {
    await owner.mouse.click(20, 20);
    await expect(mobileSheet).toHaveCount(0);
  }
  return guest;
}

export async function addKnocker(browser: Browser, room: TestRoom, name = 'waiting'): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await joinGuestAndWait(page, room, name);
  return page;
}

export async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

export async function swipeSheetDown(page: Page): Promise<void> {
  await page.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open').dispatchEvent('touchstart', {
    touches: [{ identifier: 0, clientX: 195, clientY: 190 }],
  });
  await page.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open').dispatchEvent('touchmove', {
    touches: [{ identifier: 0, clientX: 195, clientY: 270 }],
  });
}
