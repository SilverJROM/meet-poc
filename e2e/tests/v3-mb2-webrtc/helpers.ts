import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, createRoomViaApi, joinGuestAndWait, ownerSessionCookie, waitForMessage, waitForOpen, type TestRoom } from '../../fixtures/rooms';

export const MB2_PREFIX = 'MB2WEBRTC';
export const MB2_SCREENSHOT_DIR = '../plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-2/screenshots';

export function prepareMb2Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), MB2_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupMb2Artifacts(): void {
  cleanupRoomsByPrefix(MB2_PREFIX);
  cleanupRecordingsByPrefix(MB2_PREFIX);
}

export async function createMb2Room(page: Page, suffix: string): Promise<TestRoom> {
  return createRoomFromDashboard(page, `${MB2_PREFIX} ${suffix} ${Date.now()}`);
}

export async function createMb2RoomViaApi(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${MB2_PREFIX} ${suffix} ${Date.now()}`);
}

export async function joinOwnerWithCamera(page: Page, room: TestRoom, name = 'host'): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

export async function openParticipants(page: Page): Promise<void> {
  const sidebar = page.locator('app-participant-sidebar .participant-sidebar.open');
  if ((await sidebar.count()) === 0) await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.locator('app-participant-sidebar .participant-sidebar.open')).toBeVisible();
}

export async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name = 'guest'): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await openParticipants(owner);
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  return guest;
}

export async function openRawSocket(): Promise<WebSocket> {
  const wsOrigin = process.env.E2E_WS_ORIGIN || 'ws://localhost:4700';
  const ws = new WebSocket(`${wsOrigin}/ws`);
  await waitForOpen(ws);
  return ws;
}

export function waitForSocketMessage(ws: WebSocket, predicate: (msg: Record<string, any>) => boolean = () => true): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const seen: Record<string, any>[] = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ws message; seen=${JSON.stringify(seen)}`));
    }, 8000);
    const onMessage = (raw: WebSocket.RawData) => {
      const msg = JSON.parse(String(raw)) as Record<string, any>;
      seen.push(msg);
      if (!predicate(msg)) return;
      cleanup();
      resolve(msg);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.once('error', onError);
  });
}

export async function openOwnerSocket(request: APIRequestContext, room: TestRoom, name: string, mobile: boolean): Promise<WebSocket> {
  const wsOrigin = process.env.E2E_WS_ORIGIN || 'ws://localhost:4700';
  const cookie = await ownerSessionCookie(request);
  const ws = new WebSocket(`${wsOrigin}/ws`, { headers: { Cookie: cookie } });
  await waitForOpen(ws);
  ws.send(JSON.stringify({ type: 'join', room: room.id, name, mobile }));
  const admitted = await waitForMessage(ws);
  if (admitted.type !== 'admitted') throw new Error(`owner socket not admitted: ${JSON.stringify(admitted)}`);
  return ws;
}

export function closeSockets(sockets: WebSocket[]): void {
  for (const socket of sockets) {
    try {
      socket.close();
    } catch {
      // best effort cleanup only
    }
  }
}
