import { expect, test } from '@playwright/test';
import { MB3_SCREENSHOT_DIR, addKnocker, admitBrowserGuest, cleanupMb3Artifacts, createAndJoinOwner, openParticipants, prepareMb3Evidence, swipeSheetDown } from './helpers';

test.beforeAll(() => {
  prepareMb3Evidence();
  cleanupMb3Artifacts();
});

test.afterAll(() => {
  cleanupMb3Artifacts();
});

test('S2.1/S2.6/S2.7 mobile participants render as a 75dvh bottom sheet with tap tabs and swipe-down dismiss', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createAndJoinOwner(page, 'bottom-sheet');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-a');
  const knocker = await addKnocker(browser, room, 'guest-waiting');

  await openParticipants(page);
  const sheet = page.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open');
  await expect(sheet).toBeVisible();
  await expect.poll(async () => {
    const settled = await sheet.boundingBox();
    return Math.round((settled?.y ?? 0) + (settled?.height ?? 0));
  }).toBe(844);
  const box = await sheet.boundingBox();
  expect(box?.height).toBeGreaterThan(560);
  expect(box?.height).toBeLessThan(660);
  expect(Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844)).toBeLessThanOrEqual(4);
  await expect(page.locator('app-participant-sidebar .sheet-backdrop')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'In the call' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('In the call').getByText('guest-a')).toBeVisible();

  await page.getByRole('tab', { name: 'Waiting' }).click();
  await expect(page.getByRole('tab', { name: 'Waiting' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Waiting to join').getByText('guest-waiting')).toBeVisible();
  await page.screenshot({ path: `${MB3_SCREENSHOT_DIR}/mobile-bottom-sheet-open.png`, fullPage: true });

  await swipeSheetDown(page);
  await expect(page.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open')).toHaveCount(0);

  await guest.context().close();
  await knocker.context().close();
});
