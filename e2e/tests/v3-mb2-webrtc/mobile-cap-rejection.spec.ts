import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { MB2_SCREENSHOT_DIR, cleanupMb2Artifacts, closeSockets, createMb2RoomViaApi, openOwnerSocket, prepareMb2Evidence } from './helpers';

test.beforeAll(() => {
  prepareMb2Evidence();
  cleanupMb2Artifacts();
});

test.afterAll(() => {
  cleanupMb2Artifacts();
});

test('S5.3 mobile joiner sees mobile room full after 4 client-declared mobile peers', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createMb2RoomViaApi(request, 'mobile-cap');
  const sockets = [];
  try {
    for (let index = 0; index < 4; index += 1) {
      sockets.push(await openOwnerSocket(request, room, `mobile-${index}`, true));
    }

    await loginAsJrom(page);
    await page.goto(room.url);
    await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
    await page.locator('#display-name').fill('blocked-mobile');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('mobile room full (4 max)')).toBeVisible();
    await page.screenshot({ path: `${MB2_SCREENSHOT_DIR}/mobile-room-full-error.png`, fullPage: true });
  } finally {
    closeSockets(sockets);
  }
});
