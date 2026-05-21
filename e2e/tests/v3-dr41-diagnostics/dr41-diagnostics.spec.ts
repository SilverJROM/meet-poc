import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Browser, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, joinGuestAndWait, type TestRoom } from '../../fixtures/rooms';

const DR41_PREFIX = 'DR41DIAG';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-diag-deep/screenshots';

type DiagnosticDetail = {
  entries: {
    payload: {
      clientName: string;
      clientKey?: string;
      participantId?: string;
    };
  }[];
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DR41_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DR41_PREFIX);
});

test('DR-41 admitted owner and guest both post diagnostics, and logging toggle stops new samples', async ({ browser, page, request }) => {
  test.setTimeout(70_000);
  const room = await createRoomViaApi(request, `${DR41_PREFIX} two-sided ${Date.now()}`);
  await loginAsJrom(page);
  await joinOwner(page, room, 'dr41-owner');

  const guest = await admitGuest(browser, page, room, 'dr41-guest');
  await expect(page.locator('app-tile').filter({ hasText: 'dr41-guest' }).locator('.state')).toHaveText('connected', { timeout: 15_000 });

  await expect.poll(() => diagnosticClientNames(request, room.title), { timeout: 25_000, intervals: [1_500, 2_000, 2_500] }).toEqual(
    expect.arrayContaining(['dr41-owner', 'dr41-guest']),
  );
  const detail = await diagnosticDetail(request, room.title);
  expect(detail?.entries.some((entry) => entry.payload.clientName === 'dr41-guest' && !!entry.payload.clientKey && !!entry.payload.participantId)).toBe(true);

  await disableDiagnosticsLogging(page);
  await disableDiagnosticsLogging(guest);
  await page.waitForTimeout(1_000);
  const countAfterToggle = (await diagnosticDetail(request, room.title))?.entries.length ?? 0;
  await page.waitForTimeout(9_000);
  await expect.poll(async () => (await diagnosticDetail(request, room.title))?.entries.length ?? 0, { timeout: 5_000 }).toBe(countAfterToggle);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/diagnostics-logging-toggle.png`, fullPage: true });
  await guest.context().close();
});

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function admitGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  return guest;
}

async function disableDiagnosticsLogging(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show connection diagnostics' }).click();
  const toggle = page.getByLabel('Diagnostics logging');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('meet-poc.diagnosticsLogging'))).toBe('0');
}

async function diagnosticClientNames(request: APIRequestContext, roomTitle: string): Promise<string[]> {
  const detail = await diagnosticDetail(request, roomTitle);
  return [...new Set((detail?.entries ?? []).map((entry) => entry.payload.clientName))].sort();
}

async function diagnosticDetail(request: APIRequestContext, roomTitle: string): Promise<DiagnosticDetail | null> {
  const listResponse = await request.get('/api/meeting-sessions/diagnostics-log?page=1&pageSize=50');
  if (!listResponse.ok()) return null;
  const list = (await listResponse.json()) as { sessions: { id: string; roomTitle: string }[] };
  const session = list.sessions.find((candidate) => candidate.roomTitle === roomTitle);
  if (!session) return null;
  const detailResponse = await request.get(`/api/meeting-sessions/${encodeURIComponent(session.id)}/diagnostics`);
  if (!detailResponse.ok()) return null;
  return (await detailResponse.json()) as DiagnosticDetail;
}
