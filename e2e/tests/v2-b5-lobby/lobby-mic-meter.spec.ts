import { expect, test } from '@playwright/test';
import { gotoOwnedLobby } from './helpers';

test('S5.2 mic level meter shows activity', async ({ page }) => {
  await gotoOwnedLobby(page);
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expect.poll(() => page.locator('app-mic-meter .bar.is-active').count(), { timeout: 2500 }).toBeGreaterThan(0);
});
