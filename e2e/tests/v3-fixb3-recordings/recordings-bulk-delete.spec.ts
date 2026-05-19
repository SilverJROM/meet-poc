import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix, insertRoom, openE2eDb, recordingsDir } from '../../fixtures/db';

const prefix = 'FIXB3REC';
const screenshotPath = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb3/screenshots/recordings-bulk-bar.png';

test.afterEach(() => {
  cleanupRecordingsByPrefix(prefix);
  cleanupRoomsByPrefix(prefix);
});

test('FIX-B3 recordings page supports bulk and single delete', async ({ page }) => {
  cleanupRecordingsByPrefix(prefix);
  cleanupRoomsByPrefix(prefix);
  const { filenames } = seedRecordings();

  await loginAsJrom(page);
  await page.goto('/app/recordings');
  const rows = page.locator('.recording-row').filter({ hasText: prefix });
  await expect(rows).toHaveCount(3);
  for (const filename of filenames) {
    await expect(rows.filter({ hasText: filename })).toBeVisible();
  }

  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  await expect(page.locator('.bulk-bar')).toHaveClass(/active/);
  await expect(page.getByRole('button', { name: 'Delete selected (2)' })).toBeVisible();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Delete 2 recordings? This cannot be undone.');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete selected (2)' }).click();
  await expect(rows).toHaveCount(1);

  await rows.first().getByRole('checkbox').check();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('This cannot be undone.');
    await dialog.accept();
  });
  await rows.first().getByRole('button', { name: 'Delete' }).click();
  await expect(rows).toHaveCount(0);
});

function seedRecordings(): { filenames: string[] } {
  const suffix = crypto.randomBytes(3).toString('hex');
  const roomId = crypto.randomBytes(6).toString('hex');
  const title = `${prefix} Room ${suffix}`;
  const now = Date.now() + 10_000_000;
  const db = openE2eDb();
  try {
    insertRoom(db, roomId, title, now);
  } finally {
    db.close();
  }

  const dir = recordingsDir();
  fs.mkdirSync(dir, { recursive: true });
  const filenames = [0, 1, 2].map((index) => {
    const token = `${index}`.padStart(6, '0');
    const filename = `2026-05-19T11-0${index}-00-000Z_${roomId}_${prefix}_${suffix}_${token}.webm`;
    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, Buffer.from(`fixb3-${index}`));
    fs.utimesSync(filepath, now / 1000 + index, now / 1000 + index);
    return filename;
  });
  return { filenames };
}
