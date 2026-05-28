import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

test('Batch A share approval persists for the same call', async ({ browser, page }) => {
  test.setTimeout(60_000);
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `SharePersistent ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await installFakeDisplayMedia(guest);
  try {
    await joinGuestAndAdmit(page, guest, room, 'PersistentGuest');

    await guest.getByRole('button', { name: 'Share screen' }).click();
    const firstRequest = page.locator('.share-request-toast').filter({ hasText: 'PersistentGuest' });
    await expect(firstRequest).toBeVisible({ timeout: 10_000 });
    await firstRequest.getByRole('button', { name: 'Allow' }).click();

    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.screenShareAttempts), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(true);
    await expect(page.locator('.share-request-toast')).toHaveCount(0, { timeout: 5_000 });

    await guest.getByRole('button', { name: 'Stop sharing screen' }).click();
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(false);

    await guest.getByRole('button', { name: 'Share screen' }).click();
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.screenShareAttempts), { timeout: 10_000 }).toBe(2);
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(1_000);
    await expect(page.locator('.share-request-toast')).toHaveCount(0);
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
          context.fillStyle = '#e7f0ff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = '#1f2937';
          context.font = '72px sans-serif';
          context.fillText('Persistent share', 80, 150);
        }
        return canvas.captureStream();
      },
    });
  });
}
