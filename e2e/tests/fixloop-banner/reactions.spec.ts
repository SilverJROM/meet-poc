import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

test('Batch C reactions — raised hand badge is visible to peers until lowered', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `RaiseHand ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await joinGuestAndAdmit(page, guest, room, 'HandGuest');

    await guest.getByRole('button', { name: 'Reactions' }).click();
    await guest.getByRole('button', { name: 'Raise hand' }).click();

    const guestTileOnHost = page.locator('app-tile').filter({ hasText: 'HandGuest' });
    await expect(guestTileOnHost.locator('.raised-hand-badge')).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.raisedHands?.length), { timeout: 10_000 }).toBe(1);

    await guest.getByRole('button', { name: 'Lower hand' }).click();
    await expect(guestTileOnHost.locator('.raised-hand-badge')).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.raisedHands?.length), { timeout: 10_000 }).toBe(0);
  } finally {
    await guestContext.close();
  }
});

test('Batch C reactions — thumbs-up appears transiently and clears', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `ThumbsUp ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await joinGuestAndAdmit(page, guest, room, 'ThumbGuest');

    await guest.getByRole('button', { name: 'Reactions' }).click();
    await guest.getByRole('button', { name: 'Thumbs up' }).click();

    const guestTileOnHost = page.locator('app-tile').filter({ hasText: 'ThumbGuest' });
    await expect(guestTileOnHost.locator('.floating-reaction')).toContainText('👍', { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.transientReactions?.length), { timeout: 10_000 }).toBe(1);
    await expect(guestTileOnHost.locator('.floating-reaction')).toHaveCount(0, { timeout: 6_000 });
    await expect.poll(() => page.evaluate(() => window.__meetDebug?.transientReactions?.length), { timeout: 6_000 }).toBe(0);
  } finally {
    await guestContext.close();
  }
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.locator('.knock-toast-stack').getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
}
