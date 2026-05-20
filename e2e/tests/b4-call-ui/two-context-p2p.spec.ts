import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

test('S4.3 two contexts complete P2P signaling', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `P2P ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Show participants' }).click();
  const row = page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Admit' }).click();

  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect(guest.locator('app-tile')).toHaveCount(2);
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 10000 });
  await expect(guest.locator('app-tile').filter({ hasText: 'host' }).locator('.state')).toHaveText('connected', { timeout: 10000 });
  await guest.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-4/screenshots/call-view-two-peers.png', fullPage: true });
  await guestContext.close();
});
