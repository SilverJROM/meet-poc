import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S4.6 leave returns an owner to the dashboard', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `Leave ${Date.now()}`);
  await joinOwnerCall(page, room);
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('.dashboard-shell')).toBeVisible();
});
