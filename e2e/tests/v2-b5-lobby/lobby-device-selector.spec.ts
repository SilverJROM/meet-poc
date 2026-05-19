import { expect, test } from '@playwright/test';
import { gotoOwnedLobby } from './helpers';

test('S5.3 device selector populates from enumerateDevices', async ({ page }) => {
  await gotoOwnedLobby(page);
  const micSelector = page.locator('select.mic-select');
  await expect(micSelector).toBeVisible();
  await expect.poll(() => micSelector.locator('option').count()).toBeGreaterThan(0);
});
