import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S4.2 owner auto-admits into the call view', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `Owner call ${Date.now()}`);
  await joinOwnerCall(page, room);
  await expect(page.getByText('Asking the host')).toHaveCount(0);
  await expect(page.locator('app-controls-bar')).toBeVisible();
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-4/screenshots/call-view-one-peer.png', fullPage: true });
});
