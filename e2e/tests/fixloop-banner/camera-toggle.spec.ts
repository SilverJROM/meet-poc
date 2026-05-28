import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, type TestRoom } from '../../fixtures/rooms';

test('fixloop camera privacy — camera off propagates to remote tiles', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `CameraToggle ${Date.now()}`);
  await joinOwnerCallWithCamera(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await joinGuestWithCameraAndWait(guest, room, 'guest');
    await page.locator('.knock-toast-stack').getByRole('button', { name: 'Admit' }).click();
    await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 12_000 });

    await expectRemoteVideo(page, 'guest');
    await expectRemoteVideo(guest, 'host');

    await page.getByRole('button', { name: 'Turn camera off' }).click();
    await expectRemoteAvatar(guest, 'host');

    await page.getByRole('button', { name: 'Turn camera on' }).click();
    await expectRemoteVideo(guest, 'host');
  } finally {
    await guestContext.close();
  }
});

async function joinOwnerCallWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  await expect(page.locator('app-tile')).toHaveCount(1);
}

async function joinGuestWithCameraAndWait(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url + '?sfu=0');
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.locator('#display-name').fill(name);
  await page.locator('input[name="cameraRequested"]').check({ force: true });
  await page.getByRole('button', { name: 'Ask to join' }).click();
  await expect(page.getByText(/Asking the host to admit you|The host is available/)).toBeVisible();
}

function remoteTile(page: Page, name: string) {
  return page.locator('.tile[data-state="connected"]').filter({ hasText: name }).first();
}

async function expectRemoteVideo(page: Page, name: string): Promise<void> {
  const tile = remoteTile(page, name);
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await expect(tile.locator('.camera-off-avatar')).toHaveCount(0, { timeout: 10_000 });
  await expect(tile.locator('.tile-content video')).toHaveCount(1, { timeout: 10_000 });
}

async function expectRemoteAvatar(page: Page, name: string): Promise<void> {
  const tile = remoteTile(page, name);
  await expect(tile).toBeVisible({ timeout: 5_000 });
  await expect(tile.locator('.tile-content video')).toHaveCount(0, { timeout: 5_000 });
  await expect(tile.locator('.camera-off-avatar')).toHaveCount(1, { timeout: 5_000 });
}
