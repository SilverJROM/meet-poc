import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, createRoomViaApi, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

export const B7_PREFIX = 'B7CTRL';
export const B7_SCREENSHOT_DIR = '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-7/screenshots';

export function prepareB7Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), B7_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupB7Artifacts(): void {
  cleanupRoomsByPrefix(B7_PREFIX);
  cleanupRecordingsByPrefix(B7_PREFIX);
}

export async function createAndJoinOwner(page: Page, suffix: string, name = 'host'): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${B7_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, name);
  return room;
}

export async function createApiRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${B7_PREFIX} ${suffix} ${Date.now()}`);
}

export async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name = 'guest'): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  const waitingRow = owner.getByLabel('Waiting room').locator('li').filter({ hasText: name });
  await expect(waitingRow).toBeVisible();
  await waitingRow.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile')).toHaveCount(2);
  return guest;
}
