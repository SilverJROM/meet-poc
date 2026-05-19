import { expect, test } from '@playwright/test';
import { gotoOwnedLobby, lobbyTrackIds } from './helpers';

test('S5.5 join carries the pre-acquired stream into the call', async ({ page }) => {
  await gotoOwnedLobby(page);
  await expect.poll(() => lobbyTrackIds(page)).not.toEqual([]);
  const before = await lobbyTrackIds(page);
  expect(before.length).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
  const after = await lobbyTrackIds(page);

  expect(after).toEqual(before);
});
