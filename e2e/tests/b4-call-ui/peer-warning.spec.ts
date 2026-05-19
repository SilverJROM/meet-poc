import { expect, test } from '@playwright/test';
import { closeSockets, createRoomFromDashboard, joinOwnerCall, openOwnerSocket, ownerSessionCookie } from '../../fixtures/rooms';

test('S4.8 six peer warning is shown in call view', async ({ page, request }) => {
  const room = await createRoomFromDashboard(page, `Warning ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  const cookie = await ownerSessionCookie(request);
  const sockets = [];
  try {
    for (let i = 0; i < 5; i += 1) {
      sockets.push(await openOwnerSocket(room.id, cookie, `peer-${i}`));
    }
    await expect(page.locator('app-tile')).toHaveCount(6);
    await expect(page.getByText('Calls with more than 6 participants may be unstable on this stack')).toBeVisible();
  } finally {
    closeSockets(sockets);
  }
});
