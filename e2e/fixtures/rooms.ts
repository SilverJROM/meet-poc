import { expect, type APIRequestContext, type Page } from '@playwright/test';
import WebSocket from 'ws';
import { email, initialPassword, loginAsJrom } from './auth';

export type TestRoom = {
  id: string;
  title: string;
  url: string;
};

export async function createRoomViaApi(request: APIRequestContext, title: string): Promise<TestRoom> {
  await request.post('/api/login', { data: { email, password: initialPassword() } });
  const res = await request.post('/api/rooms', { data: { title } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return { id: json.room.id, title: json.room.title, url: `/room/${json.room.id}` };
}

export async function createRoomFromDashboard(page: Page, title: string): Promise<TestRoom> {
  await loginAsJrom(page);
  await page.locator('#room-title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  const row = page.locator('.room-row').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  const href = await row.getByRole('link', { name: 'Join' }).getAttribute('href');
  if (!href) throw new Error('room href missing');
  const id = href.split('/').pop() ?? '';
  return { id, title, url: href };
}

export async function ownerSessionCookie(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/login', { data: { email, password: initialPassword() } });
  const cookie = res.headers()['set-cookie'] || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) throw new Error('session cookie missing');
  return `session=${match[1]}`;
}

export async function openOwnerSocket(roomId: string, cookie: string, name: string): Promise<WebSocket> {
  const wsOrigin = process.env.E2E_WS_ORIGIN || 'ws://localhost:4710';
  const ws = new WebSocket(`${wsOrigin}/ws`, { headers: { Cookie: cookie } });
  await waitForOpen(ws);
  ws.send(JSON.stringify({ type: 'join', room: roomId, name }));
  const first = await waitForMessage(ws);
  if (first.type !== 'admitted') throw new Error(`owner socket not admitted: ${JSON.stringify(first)}`);
  return ws;
}

export async function joinOwnerCall(page: Page, room: TestRoom, name = 'jrom'): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(1);
}

export async function joinGuestAndWait(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText('Asking the host to admit you...')).toBeVisible();
}

export async function waitForOpen(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

export async function waitForMessage(ws: WebSocket): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for ws message')), 8000);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(String(raw)));
    });
    ws.once('error', reject);
  });
}

export function closeSockets(sockets: WebSocket[]): void {
  for (const ws of sockets) {
    try {
      ws.close();
    } catch {
      // best effort cleanup
    }
  }
}
