import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

test('S4.4 owner can admit and reject waiting guests', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `Waiting room ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest-a');
  await guest.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-4/screenshots/lobby-knocking-state.png', fullPage: true });
  await page.getByRole('button', { name: 'Show participants' }).click();
  await expect(page.getByLabel('Waiting to join').getByText('guest-a')).toBeVisible();
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-4/screenshots/owner-waiting-room.png', fullPage: true });
  await page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-a' }).getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(2);

  const rejectContext = await browser.newContext();
  const rejected = await rejectContext.newPage();
  await joinGuestAndWait(rejected, room, 'guest-b');
  const row = page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-b' });
  await row.getByRole('button', { name: 'Reject' }).click();
  await expect(rejected.getByRole('heading', { name: 'Request declined' })).toBeVisible();
  await expect(page.getByLabel('Waiting to join').getByText('guest-b')).toHaveCount(0);
  await guestContext.close();
  await rejectContext.close();
});
