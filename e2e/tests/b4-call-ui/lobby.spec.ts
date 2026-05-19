import { expect, test } from '@playwright/test';
import { createRoomViaApi } from '../../fixtures/rooms';

test('S4.1 guest lobby shows room title and no dashboard panel', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `Team sync ${Date.now()}`);
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await expect(page.locator('#display-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask to join' })).toBeVisible();
  await expect(page.locator('.dashboard-shell')).toHaveCount(0);
});
