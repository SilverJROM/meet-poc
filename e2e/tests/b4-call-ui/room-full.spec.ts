import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { closeSockets, createRoomViaApi, openOwnerSocket, ownerSessionCookie } from '../../fixtures/rooms';

test('S4.7 ninth peer sees room full error', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `Full ${Date.now()}`);
  const cookie = await ownerSessionCookie(request);
  const sockets = [];
  try {
    for (let i = 0; i < 8; i += 1) {
      sockets.push(await openOwnerSocket(room.id, cookie, `seed-${i}`));
    }
    await loginAsJrom(page);
    await page.goto(room.url);
    await page.locator('#display-name').fill('ninth');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('Room full (max 8)')).toBeVisible();
  } finally {
    closeSockets(sockets);
  }
});
