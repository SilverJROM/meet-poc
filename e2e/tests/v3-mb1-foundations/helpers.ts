import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

export const MB1_PREFIX = 'MB1FOUND';
export const MB1_SCREENSHOT_DIR = '../plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-1/screenshots';

export function prepareMb1Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), MB1_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupMb1Artifacts(): void {
  cleanupRoomsByPrefix(MB1_PREFIX);
  cleanupRecordingsByPrefix(MB1_PREFIX);
}

export async function createMb1Room(page: Page, suffix: string): Promise<TestRoom> {
  return createRoomFromDashboard(page, `${MB1_PREFIX} ${suffix} ${Date.now()}`);
}

export async function createAndJoinOwner(page: Page, suffix: string, name = 'host'): Promise<TestRoom> {
  const room = await createMb1Room(page, suffix);
  await joinOwnerCall(page, room, name);
  return room;
}

export async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await openParticipants(owner);
  const waitingRow = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(waitingRow).toBeVisible();
  await waitingRow.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile')).toHaveCount(2);
  return guest;
}

export async function addKnocker(browser: Browser, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await joinGuestAndWait(page, room, name);
  return page;
}

export async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) {
    await page.getByRole('button', { name: 'Show participants' }).click();
  }
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

export async function expectTouchTarget(locator: Locator, name: string): Promise<void> {
  const box = await locator.first().boundingBox();
  expect(box, `${name} should be visible and measurable`).not.toBeNull();
  expect(Math.floor(box?.width ?? 0), `${name} width`).toBeGreaterThanOrEqual(48);
  expect(Math.floor(box?.height ?? 0), `${name} height`).toBeGreaterThanOrEqual(48);
}
