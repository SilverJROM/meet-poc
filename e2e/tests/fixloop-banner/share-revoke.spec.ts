import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

test('Batch A host can revoke a persistent share approval', async ({ browser, page }) => {
  test.setTimeout(75_000);
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `ShareRevoke ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await installFakeDisplayMedia(guest);
  try {
    await joinGuestAndAdmit(page, guest, room, 'RevokeGuest');

    await guest.getByRole('button', { name: 'Share screen' }).click();
    const firstRequest = page.locator('.share-request-toast').filter({ hasText: 'RevokeGuest' });
    await expect(firstRequest).toBeVisible({ timeout: 10_000 });
    await firstRequest.getByRole('button', { name: 'Allow' }).click();

    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(true);
    await page.getByRole('button', { name: 'Show participants' }).click();
    const row = page.getByLabel('In the call').locator('li').filter({ hasText: 'RevokeGuest' });
    await row.getByRole('button', { name: 'Actions for RevokeGuest' }).click();
    await row.getByRole('menuitem', { name: 'Revoke share permission' }).click();

    await expect(guest.locator('.device-notice').getByText("Host revoked your screen-share permission. Your current share continues; next time you'll need to ask again.")).toBeVisible({
      timeout: 10_000,
    });

    await guest.getByRole('button', { name: 'Stop sharing screen' }).click();
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(false);
    await guest.getByRole('button', { name: 'Share screen' }).click();

    const secondRequest = page.locator('.share-request-toast').filter({ hasText: 'RevokeGuest' });
    await expect(secondRequest).toBeVisible({ timeout: 10_000 });
  } finally {
    await guestContext.close();
  }
});

async function joinGuestAndAdmit(owner: Page, guest: Page, room: TestRoom, name: string): Promise<void> {
  await joinGuestAndWait(guest, room, name);
  await owner.locator('.knock-toast-stack').getByRole('button', { name: 'Admit' }).click();
  await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 10_000 });
}

async function installFakeDisplayMedia(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#eef8f0';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1f2937';
          context.font = '72px sans-serif';
          context.fillText('Revocable share', 80, 150);
        }
        return canvas.captureStream();
      },
    });
  });
}
