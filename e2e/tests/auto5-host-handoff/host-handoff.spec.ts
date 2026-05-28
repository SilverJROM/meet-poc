import { expect, test, type Page } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const PREFIX = 'AUTO5';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  cleanupRoomsByPrefix(PREFIX);
  cleanupRecordingsByPrefix(PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(PREFIX);
  cleanupRecordingsByPrefix(PREFIX);
});

test('first open-room joiner acts as host until the owner joins', async ({ browser, request }) => {
  const room = await createRoomViaApi(request, `${PREFIX} handoff ${Date.now()}`, { open: true });
  const actingContext = await browser.newContext();
  const guestBContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const acting = await actingContext.newPage();
  const guestB = await guestBContext.newPage();
  const owner = await ownerContext.newPage();

  try {
    await joinOpenRoom(acting, room, 'Guest A');
    await expect.poll(() => isLocalHost(acting), { timeout: 10_000 }).toBe(true);

    await knock(guestB, room, 'Guest B');
    const guestBToast = acting.locator('.knock-toast').filter({ hasText: 'Guest B' });
    await expect(guestBToast).toBeVisible({ timeout: 10_000 });
    await guestBToast.getByRole('button', { name: 'Admit' }).click();
    await expect(guestB.locator('.call-panel')).toBeVisible({ timeout: 10_000 });

    await loginAsJrom(owner);
    await joinOwner(owner, room, 'Owner');
    await expect.poll(() => isLocalHost(owner), { timeout: 10_000 }).toBe(true);
    await expect.poll(() => isLocalHost(acting), { timeout: 10_000 }).toBe(false);
  } finally {
    await ownerContext.close();
    await guestBContext.close();
    await actingContext.close();
  }
});

test('acting host leave promotes the next admitted participant', async ({ browser, request }) => {
  const room = await createRoomViaApi(request, `${PREFIX} promote ${Date.now()}`, { open: true });
  const actingContext = await browser.newContext();
  const nextHostContext = await browser.newContext();
  const guestCContext = await browser.newContext();
  const acting = await actingContext.newPage();
  const nextHost = await nextHostContext.newPage();
  const guestC = await guestCContext.newPage();

  try {
    await joinOpenRoom(acting, room, 'Guest A');
    await knock(nextHost, room, 'Guest B');
    await acting.locator('.knock-toast').filter({ hasText: 'Guest B' }).getByRole('button', { name: 'Admit' }).click();
    await expect(nextHost.locator('.call-panel')).toBeVisible({ timeout: 10_000 });

    await acting.getByRole('button', { name: 'Leave call' }).click();
    await acting.getByRole('dialog', { name: 'Leave meeting' }).getByRole('button', { name: 'Leave' }).click();
    await expect.poll(() => isLocalHost(nextHost), { timeout: 10_000 }).toBe(true);

    await knock(guestC, room, 'Guest C');
    const guestCToast = nextHost.locator('.knock-toast').filter({ hasText: 'Guest C' });
    await expect(guestCToast).toBeVisible({ timeout: 10_000 });
    await guestCToast.getByRole('button', { name: 'Admit' }).click();
    await expect(guestC.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
  } finally {
    await guestCContext.close();
    await nextHostContext.close();
    await actingContext.close();
  }
});

async function joinOpenRoom(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
}

async function knock(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

async function joinOwner(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
}

async function isLocalHost(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const debug = window.__meetDebug;
    const myId = debug?.myClientId;
    return !!debug?.peers.find((peer) => peer.id === myId && peer.isHost);
  });
}
