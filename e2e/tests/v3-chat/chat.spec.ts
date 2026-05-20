import fs from 'node:fs';
import path from 'node:path';
import { expect, type Browser, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

const CHAT_PREFIX = 'CHAT27';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/batch-chat/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(CHAT_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(CHAT_PREFIX);
});

test('DR-27 admitted peers exchange ephemeral chat with unread badge and XSS-safe text rendering', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'realtime');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-chat');

  await openChat(page);
  await sendChat(page, 'hello from host');
  await expect(page.locator('.chat-message').filter({ hasText: 'hello from host' })).toBeVisible();
  await expect(guest.locator('.chat-toggle .chat-badge')).toHaveText('1');
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/chat-unread-badge.png`, fullPage: true });

  await openChat(guest);
  await expect(guest.locator('.chat-toggle .chat-badge')).toHaveCount(0);
  await expect(guest.locator('.chat-message').filter({ hasText: 'host' }).filter({ hasText: 'hello from host' })).toBeVisible();
  await guest.screenshot({ path: `${SCREENSHOT_DIR}/chat-panel.png`, fullPage: true });

  const xssText = `<img src=x onerror="window.__chatXss=1"><script>window.__chatXss=1</script>`;
  await sendChat(page, xssText);
  await expect(guest.locator('.chat-message').filter({ hasText: xssText })).toBeVisible();
  await expect.poll(() => guest.evaluate(() => (window as Window & { __chatXss?: number }).__chatXss ?? 0)).toBe(0);

  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'End meeting for everyone' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await guest.context().close();

  await joinOwnerCall(page, room, 'host');
  await openChat(page);
  await expect(page.locator('.chat-empty')).toContainText('No messages yet.');
  await expect(page.locator('.chat-message')).toHaveCount(0);
});

async function createAndJoinOwner(page: Page, suffix: string): Promise<TestRoom> {
  const room = await createRoomFromDashboard(page, `${CHAT_PREFIX} ${suffix} ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  return room;
}

async function admitBrowserGuest(browser: Browser, owner: Page, room: TestRoom, name: string): Promise<Page> {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await joinGuestAndWait(guest, room, name);
  await owner.getByRole('button', { name: 'Show participants' }).click();
  const row = owner.getByLabel('Waiting to join').locator('li').filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(owner.locator('app-tile').filter({ hasText: name }).locator('.state')).toHaveText('connected', { timeout: 12000 });
  await owner.getByRole('button', { name: 'Hide participants' }).click();
  return guest;
}

async function openChat(page: Page): Promise<void> {
  const panel = page.getByLabel('Meeting chat');
  if ((await panel.count()) === 0) await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByLabel('Meeting chat')).toBeVisible();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await openChat(page);
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}
