import { expect, test, type Page } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall, type TestRoom } from '../../fixtures/rooms';

test('Batch C share approval — guest request is approved before screen publish starts', async ({ browser, page }) => {
  test.setTimeout(60_000);
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `ShareApprove ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await installFakeDisplayMedia(guest);
  try {
    await joinGuestAndAdmit(page, guest, room, 'ShareGuest');

    await guest.getByRole('button', { name: 'Share screen' }).click();
    await expect(guest.getByText('Requesting permission to share...')).toBeVisible();
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.myShareRequestPending)).toBe(true);
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.screenShareAttempts)).toBe(0);

    const requestToast = page.locator('.share-request-toast').filter({ hasText: 'ShareGuest' });
    await expect(requestToast).toBeVisible({ timeout: 10_000 });
    await requestToast.getByRole('button', { name: 'Allow' }).click();

    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.myShareRequestPending), { timeout: 10_000 }).toBe(false);
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.screenShareAttempts), { timeout: 10_000 }).toBe(1);
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.shareLayoutActive), { timeout: 10_000 }).toBe(true);
    await expect(guest.locator('.call-panel.share-layout')).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test('Batch C share approval — denied guest request shows inline notice without publishing', async ({ browser, page }) => {
  test.setTimeout(60_000);
  await installFakeDisplayMedia(page);
  const room = await createRoomFromDashboard(page, `ShareDeny ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await installFakeDisplayMedia(guest);
  try {
    await joinGuestAndAdmit(page, guest, room, 'DenyGuest');

    await guest.getByRole('button', { name: 'Share screen' }).click();
    await expect(guest.getByText('Requesting permission to share...')).toBeVisible();

    const requestToast = page.locator('.share-request-toast').filter({ hasText: 'DenyGuest' });
    await expect(requestToast).toBeVisible({ timeout: 10_000 });
    await requestToast.getByRole('button', { name: 'Deny' }).click();

    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.myShareRequestPending), { timeout: 10_000 }).toBe(false);
    await expect(guest.locator('.device-notice').getByText('Host denied screen share.')).toBeVisible();
    await expect.poll(() => guest.evaluate(() => window.__meetDebug?.screenShareAttempts), { timeout: 5_000 }).toBe(0);
    await expect(guest.locator('.call-panel.share-layout')).toHaveCount(0);
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
          context.fillText('Approved share', 80, 150);
        }
        return canvas.captureStream();
      },
    });
  });
}
