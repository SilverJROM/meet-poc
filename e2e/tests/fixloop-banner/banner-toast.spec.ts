import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

// Validates fix-loop B1+B2 and in-call UX Batch A:
// R1: host sees a knock toast with guest name + Admit/Reject BEFORE opening the sidebar
// R3: toast auto-dismisses after Admit
// R5/R6 are not directly tested here (code-review-only per og-requirements.md)
test('fixloop B1 — host sees knock toast with guest name + admit before sidebar open', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `FixLoop ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  // Sanity: sidebar is NOT open by default
  // (R1 requires the host to see the name without opening it).
  const sidebar = page.locator('app-participant-sidebar');
  await expect(sidebar).toHaveCount(0);

  // Toast should not be present before any knock
  await expect(page.locator('.knock-toast-stack')).toHaveCount(0);

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await joinGuestAndWait(guest, room, 'BannerGuest');

    // R1: toast appears with the guest's name + Admit button
    const toastStack = page.locator('.knock-toast-stack');
    await expect(toastStack).toBeVisible({ timeout: 10_000 });
    await expect(toastStack.locator('.knock-toast')).toHaveCount(1);
    await expect(toastStack.getByText('BannerGuest')).toBeVisible();
    await expect(toastStack.getByRole('button', { name: 'Admit' })).toBeVisible();
    await expect(toastStack.getByRole('button', { name: 'Reject' })).toBeVisible();

    // R1 (continued): sidebar is STILL not open at this point
    await expect(page.locator('app-participant-sidebar')).toHaveCount(0);

    // Admit from the toast
    await toastStack.getByRole('button', { name: 'Admit' }).click();

    // Guest enters the call
    await expect(guest.locator('.call-panel')).toBeVisible({ timeout: 8_000 });

    // R3: toast auto-dismisses
    await expect(page.locator('.knock-toast-stack')).toHaveCount(0, { timeout: 5_000 });

    // Host sees the guest's tile present
    await expect(page.locator('app-tile')).toHaveCount(2);
  } finally {
    await guestContext.close();
  }
});

test('fixloop B1 — toast reject path also clears toast', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `FixLoopReject ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await joinGuestAndWait(guest, room, 'RejectGuest');

    const toastStack = page.locator('.knock-toast-stack');
    await expect(toastStack).toBeVisible({ timeout: 10_000 });
    await expect(toastStack.getByText('RejectGuest')).toBeVisible();

    await toastStack.getByRole('button', { name: 'Reject' }).click();

    // Toast clears
    await expect(page.locator('.knock-toast-stack')).toHaveCount(0, { timeout: 5_000 });

    // Guest gets the rejected screen
    await expect(guest.getByRole('heading', { name: 'Request declined' })).toBeVisible({ timeout: 5_000 });
  } finally {
    await guestContext.close();
  }
});

test('fixloop Batch A — host can admit all waiting guests from knock toast', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `FixLoopAdmitAll ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const guests = await Promise.all(guestContexts.map((context) => context.newPage()));
  try {
    await Promise.all([
      joinGuestAndWait(guests[0], room, 'AdmitAllOne'),
      joinGuestAndWait(guests[1], room, 'AdmitAllTwo'),
    ]);

    const toastStack = page.locator('.knock-toast-stack');
    await expect(toastStack.locator('.knock-toast')).toHaveCount(2, { timeout: 10_000 });
    await expect(toastStack.getByRole('button', { name: 'Admit all (2)' })).toBeVisible();

    await toastStack.getByRole('button', { name: 'Admit all (2)' }).click();

    await Promise.all(guests.map((guest) => expect(guest.locator('.call-panel')).toBeVisible({ timeout: 8_000 })));
    await expect(page.locator('.knock-toast-stack')).toHaveCount(0, { timeout: 5_000 });
  } finally {
    await Promise.all(guestContexts.map((context) => context.close()));
  }
});

test('fixloop B1 — non-host never sees knock toast', async ({ browser, page }) => {
  // Set up a fresh room and admit one peer first so we can verify peer's view doesn't show the toast
  // when another guest later knocks.
  const room = await createRoomFromDashboard(page, `FixLoopGuestView ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const peerCtx = await browser.newContext();
  const peer = await peerCtx.newPage();

  const secondGuestCtx = await browser.newContext();
  const secondGuest = await secondGuestCtx.newPage();

  try {
    await joinGuestAndWait(peer, room, 'AdmittedPeer');
    await page.locator('.knock-toast-stack').getByRole('button', { name: 'Admit' }).click();
    await expect(peer.locator('.call-panel')).toBeVisible({ timeout: 8_000 });

    // From the admitted peer's perspective, knock a second guest in.
    await joinGuestAndWait(secondGuest, room, 'SecondGuest');

    // Host should see the toast
    await expect(page.locator('.knock-toast-stack')).toBeVisible({ timeout: 8_000 });
    // The non-host peer should NEVER see a proactive toast.
    await expect(peer.locator('.knock-toast-stack')).toHaveCount(0);
  } finally {
    await secondGuestCtx.close();
    await peerCtx.close();
  }
});
