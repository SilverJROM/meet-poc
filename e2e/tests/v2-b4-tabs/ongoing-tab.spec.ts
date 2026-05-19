import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix, insertMeetingSession, insertRoom, openE2eDb } from '../../fixtures/db';

const prefix = 'B4 Ongoing';

test.afterEach(() => {
  cleanupRoomsByPrefix(prefix);
});

test('S4.3 ongoing tab shows live sessions and polling picks up new rows', async ({ page }) => {
  cleanupRoomsByPrefix(prefix);

  await loginAsJrom(page);
  await page.goto('/app/ongoing');
  await expect(page.getByText('No meetings in progress.')).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-ongoing-empty.png',
    fullPage: true,
  });

  const first = seedActiveSession(`${prefix} One`, 'b40000000101', 2);
  await expect(page.locator('.session-row').filter({ hasText: first.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join meeting' }).first()).toHaveAttribute('href', new RegExp(`/room/${first.roomId}$`));

  const second = seedActiveSession(`${prefix} Two`, 'b40000000102', 3);
  await expect(page.locator('.session-row').filter({ hasText: second.title })).toBeVisible({ timeout: 7000 });
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-ongoing-populated.png',
    fullPage: true,
  });
});

function seedActiveSession(title: string, roomId: string, admittedPeak: number): { title: string; roomId: string } {
  const db = openE2eDb();
  try {
    insertRoom(db, roomId, title, Date.now());
    insertMeetingSession(db, {
      id: crypto.randomUUID(),
      roomId,
      startedAt: Date.now() - 120000,
      endedAt: null,
      admittedPeak,
    });
    return { title, roomId };
  } finally {
    db.close();
  }
}
