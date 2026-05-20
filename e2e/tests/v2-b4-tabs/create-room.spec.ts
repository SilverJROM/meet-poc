import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix, openE2eDb } from '../../fixtures/db';

const prefix = 'B4 Create Room';

test.afterEach(() => {
  cleanupRoomsByPrefix(prefix);
});

test('S4.2 create room form stays on Rooms tab', async ({ page }) => {
  await loginAsJrom(page);
  const title = `${prefix} ${Date.now()}`;
  await page.locator('#room-title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect
    .poll(() => {
      const db = openE2eDb();
      try {
        return (db.prepare('SELECT COUNT(*) AS total FROM rooms WHERE title = ?').get(title) as { total: number }).total;
      } finally {
        db.close();
      }
    })
    .toBe(1);
  const db = openE2eDb();
  try {
    db.prepare('UPDATE rooms SET created_at = ? WHERE title = ?').run(Date.now() + 2_000_000, title);
  } finally {
    db.close();
  }
  await page.goto('/app/rooms');

  await expect(page).toHaveURL(/\/app\/rooms/);
  const row = page.locator('.room-row').filter({ hasText: title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', /\/room\/b4-create-room-\d+-[a-z0-9]{6}$/);
});
