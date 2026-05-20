import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S4.6 leave returns an owner to the rooms app', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `Leave ${Date.now()}`);
  await joinOwnerCall(page, room);
  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'Leave but keep meeting going' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await expect(page.locator('.app-shell')).toBeVisible();
});
