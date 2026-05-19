import { expect, test } from '@playwright/test';
import { B6_SCREENSHOT_DIR, createAndJoinOwner, admitBrowserGuest, prepareB6Evidence } from './helpers';

test.beforeAll(() => {
  prepareB6Evidence();
});

test('S6.2 renders HOST badge only on the owner tile', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'host-badge');
  const guest = await admitBrowserGuest(browser, page, room, 'guest');

  await expect(page.locator('app-tile').filter({ hasText: 'host' }).locator('.host-badge')).toHaveText('HOST');
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.host-badge')).toHaveCount(0);
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/host-badge.png`, fullPage: true });
  await guest.context().close();
});

test('S6.3 relays mute state to other admitted peers', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'mute-state');
  const guest = await admitBrowserGuest(browser, page, room, 'guest-muted');

  await guest.getByRole('button', { name: 'Mute' }).click();
  await expect(page.locator('app-tile').filter({ hasText: 'guest-muted' }).locator('.mute-icon')).toBeVisible();
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/mute-icon-visible.png`, fullPage: true });
  await guest.context().close();
});

test('S6.4 renders camera-off initials avatar in participant tiles', async ({ browser, page }) => {
  const room = await createAndJoinOwner(page, 'camera-avatar');
  const guest = await admitBrowserGuest(browser, page, room, 'alice');

  await expect(page.locator('app-tile').filter({ hasText: 'alice' }).locator('.camera-off-avatar')).toBeVisible();
  await expect(page.locator('app-tile').filter({ hasText: 'alice' }).locator('.camera-off-avatar')).toContainText('A');
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/camera-off-avatar.png`, fullPage: true });
  await guest.context().close();
});

test('S6.5 starts and advances a meeting elapsed clock after admission', async ({ page }) => {
  await createAndJoinOwner(page, 'clock');

  const clock = page.getByLabel('Meeting elapsed time');
  await expect(clock).toHaveText('0:00');
  await expect.poll(async () => clock.textContent()).toMatch(/^0:0[1-5]$/);
  await page.waitForTimeout(4000);
  await expect(clock).toHaveText(/^0:0[4-9]$/);
  await page.screenshot({ path: `${B6_SCREENSHOT_DIR}/clock-0-05.png`, fullPage: true });
});
