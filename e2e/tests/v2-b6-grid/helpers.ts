import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom, waitForMessage, waitForOpen } from '../../fixtures/rooms';

export const B6_PREFIX = 'B6GRID';
export const B6_SCREENSHOT_DIR = '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-6/screenshots';

export function prepareB6Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), B6_SCREENSHOT_DIR), { recursive: true });
}

export async function createAndJoinOwner(page: Page, suffix: string): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${B6_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
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

export async function openSocketGuest(room: TestRoom, name: string): Promise<WebSocket> {
  const wsOrigin = process.env.E2E_WS_ORIGIN || 'ws://localhost:4700';
  const ws = new WebSocket(`${wsOrigin}/ws`);
  await waitForOpen(ws);
  ws.send(JSON.stringify({ type: 'join', room: room.id, name }));
  const first = await waitForMessage(ws);
  if (first.type !== 'knocking') throw new Error(`guest did not knock: ${JSON.stringify(first)}`);
  return ws;
}

export async function admitSocketGuest(owner: Page, _ws: WebSocket, name: string): Promise<void> {
  await openParticipants(owner);
  const waitingRow = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(waitingRow).toBeVisible();
  await waitingRow.getByRole('button', { name: 'Admit' }).click();
  await expect(waitingRow).toHaveCount(0);
}

async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) {
    await page.getByRole('button', { name: 'Show participants' }).click();
  }
  await expect(sidebar).toBeVisible();
}

export function closeSocketGuests(sockets: WebSocket[]): void {
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // best effort cleanup only
    }
  }
}
