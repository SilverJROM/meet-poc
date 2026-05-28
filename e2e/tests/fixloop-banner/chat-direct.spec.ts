import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

test('Batch D direct chat — A can DM B without delivering to C', async ({ browser, page }) => {
  test.setTimeout(60_000);

  const room = await createRoomFromDashboard(page, `DirectChat ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [guestB, guestC] = await Promise.all(guestContexts.map((context) => context.newPage()));

  try {
    await joinGuestAndAdmit(page, guestB, room, 'DirectB');
    await joinGuestAndAdmit(page, guestC, room, 'DirectC');

    await openChat(page);
    await page.getByRole('tab', { name: /DirectB/ }).click();
    await sendChat(page, 'private hello to B');
    await expect(page.locator('.chat-message').filter({ hasText: 'private hello to B' })).toBeVisible();

    await expect(guestB.locator('.chat-toggle .chat-badge')).toHaveText('1', { timeout: 10_000 });
    await openChat(guestB);
    await guestB.getByRole('tab', { name: /host/ }).click();
    await expect(guestB.locator('.chat-message').filter({ hasText: 'private hello to B' })).toBeVisible();

    await openChat(guestC);
    await guestC.getByRole('tab', { name: /host/ }).click();
    await expect(guestC.locator('.chat-message').filter({ hasText: 'private hello to B' })).toHaveCount(0);
    await expect(guestC.locator('.chat-toggle .chat-badge')).toHaveCount(0);
  } finally {
    await Promise.all(guestContexts.map((context) => context.close()));
  }
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.locator('.knock-toast-stack').getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
}

async function openChat(page: Page): Promise<void> {
  const panel = page.getByLabel('Meeting chat');
  if ((await panel.count()) === 0) await page.getByRole('button', { name: 'Show chat' }).click();
  await expect(page.getByLabel('Meeting chat')).toBeVisible();
}

async function sendChat(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Message' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
}
