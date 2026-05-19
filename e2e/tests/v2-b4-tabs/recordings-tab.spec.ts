import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import {
  cleanupRecordingsByPrefix,
  cleanupRoomsByPrefix,
  insertMeetingSession,
  insertRoom,
  openE2eDb,
  recordingsDir,
} from '../../fixtures/db';

const prefix = 'B4Recording';
const title = 'B4 Recording Room';

test.afterEach(() => {
  cleanupRecordingsByPrefix(prefix);
  cleanupRoomsByPrefix(title);
});

test('S4.5 recordings tab shows seeded recording with download link', async ({ page }) => {
  cleanupRecordingsByPrefix(prefix);
  cleanupRoomsByPrefix(title);
  const roomId = 'b40000000301';
  const sessionId = crypto.randomUUID();
  const db = openE2eDb();
  const now = Date.now();
  try {
    insertRoom(db, roomId, title, now);
    insertMeetingSession(db, {
      id: sessionId,
      roomId,
      startedAt: now - 60000,
      endedAt: now,
      admittedPeak: 2,
      endedReason: 'last-peer-left',
    });
  } finally {
    db.close();
  }
  const dir = recordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filename = `2026-05-19T04-00-00-000Z_${sessionId}_${roomId}_${prefix}_111111.webm`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from('webm'));

  await loginAsJrom(page);
  await page.goto('/app/recordings');
  const row = page.locator('.recording-row').filter({ hasText: filename }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Download' })).toHaveAttribute('href', new RegExp(`/api/recordings/${filename}/download$`));
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-4/screenshots/app-recordings.png',
    fullPage: true,
  });
});
