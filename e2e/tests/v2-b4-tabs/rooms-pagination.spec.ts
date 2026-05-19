import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix, insertRoom, openE2eDb } from '../../fixtures/db';

const prefix = 'B4 Rooms Page';

test.afterEach(() => {
  cleanupRoomsByPrefix(prefix);
});

test('S4.1 rooms tab paginates and persists page in URL', async ({ page }) => {
  cleanupRoomsByPrefix(prefix);
  const db = openE2eDb();
  const now = Date.now() + 1_000_000;
  const existingCount = (
    db.prepare('SELECT COUNT(*) AS total FROM rooms WHERE owner_email = ? AND title NOT LIKE ?').get(
      'jrom@silverjrom.app',
      `${prefix}%`,
    ) as { total: number }
  ).total;
  const seedCount = Math.max(0, 25 - existingCount);
  try {
    for (let i = 0; i < seedCount; i += 1) {
      insertRoom(db, `b400000000${i.toString(16).padStart(2, '0')}`, `${prefix} ${String(i + 1).padStart(2, '0')}`, now + i);
    }
  } finally {
    db.close();
  }

  await loginAsJrom(page);
  await page.goto('/app/rooms');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.locator('.room-row')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Next' })).toBeEnabled();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-rooms-page-1.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/app\/rooms\?page=2$/);
  await expect(page.getByText('Page 2 of 2')).toBeVisible();
  const totalText = await page.locator('.rooms-panel .muted').innerText();
  const total = Number(totalText.match(/\d+/)?.[0] || 25);
  await expect(page.locator('.room-row')).toHaveCount(total - 20);
  await expect(page.getByRole('button', { name: 'Prev' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-rooms-page-2.png',
    fullPage: true,
  });
});
