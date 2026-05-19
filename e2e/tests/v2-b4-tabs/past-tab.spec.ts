import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix, insertMeetingSession, insertRoom, openE2eDb } from '../../fixtures/db';

const prefix = 'B4 Past';

test.afterEach(() => {
  cleanupRoomsByPrefix(prefix);
});

test('S4.4 past tab shows ended sessions with formatted duration', async ({ page }) => {
  cleanupRoomsByPrefix(prefix);
  const db = openE2eDb();
  const now = Date.now();
  try {
    for (let i = 0; i < 2; i += 1) {
      const roomId = `b4000000020${i}`;
      insertRoom(db, roomId, `${prefix} ${i + 1}`, now + i);
      insertMeetingSession(db, {
        id: crypto.randomUUID(),
        roomId,
        startedAt: now - 60000,
        endedAt: now,
        admittedPeak: 2,
        endedReason: 'last-peer-left',
      });
    }
  } finally {
    db.close();
  }

  await loginAsJrom(page);
  await page.goto('/app/past');
  await expect(page.locator('.session-row').filter({ hasText: `${prefix} 1` }).filter({ hasText: '1:00' })).toBeVisible();
  await expect(page.locator('.session-row').filter({ hasText: `${prefix} 2` }).filter({ hasText: '1:00' })).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-past-populated.png',
    fullPage: true,
  });
});
