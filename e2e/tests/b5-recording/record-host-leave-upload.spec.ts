import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { recordingsDir } from '../../fixtures/db';
import { createRoomViaApi, joinOwnerCall } from '../../fixtures/rooms';

const delayedUploadMs = 9_500;

test('B5 recording survives delayed upload when host ends the meeting', async ({ page, request }) => {
  await verifyRecordingSurvivesHostExit(page, request, 'close-room');
});

test('B5 recording survives delayed upload when host leaves without closing the room', async ({ page, request }) => {
  await verifyRecordingSurvivesHostExit(page, request, 'leave');
});

async function verifyRecordingSurvivesHostExit(
  page: Page,
  request: Parameters<typeof createRoomViaApi>[0],
  exitAction: 'close-room' | 'leave',
): Promise<void> {
  test.setTimeout(60_000);

  const room = await createRoomViaApi(request, `B5 delayed upload ${Date.now()}`);
  const existingFiles = recordingFilesForRoom(room.id);
  let delayedPrimaryUpload = false;

  await page.route('**/upload', async (route: Route) => {
    const request = route.request();
    const headers = request.headers();
    if (!delayedPrimaryUpload && request.method() === 'POST' && headers['x-peruser'] !== '1') {
      delayedPrimaryUpload = true;
      await new Promise((resolve) => setTimeout(resolve, delayedUploadMs));
    }
    await route.continue();
  });

  await loginAsJrom(page);
  await joinOwnerCall(page, room, 'host');
  await page.getByRole('button', { name: 'More controls' }).click();
  await page.getByRole('menuitem', { name: 'Record meeting' }).click();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isRecording)).toBe(true);
  await page.waitForTimeout(2_200);
  await dismissDeviceDialogIfOpen(page);

  await page.getByRole('button', { name: 'Leave call' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave meeting' })).toBeVisible();
  if (exitAction === 'close-room') {
    await page.getByRole('button', { name: /Close room|End meeting for everyone/ }).click();
  } else {
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/app\/rooms$/, { timeout: 20_000 });

  await expect.poll(() => delayedPrimaryUpload, { timeout: 12_000 }).toBe(true);
  await expect.poll(() => newestRecordingForRoom(room.id, existingFiles), { timeout: 15_000 }).not.toBeNull();
  const savedFile = newestRecordingForRoom(room.id, existingFiles);
  if (!savedFile) throw new Error('recording file was not saved');
  expect(savedFile).toContain(room.id);

  await page.goto('/app/recordings');
  const row = page.locator('.recording-row').filter({ hasText: savedFile as string }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(room.title);
  await expect(row.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /\/api\/recordings\/.*\/download$/);
}

function recordingFilesForRoom(roomId: string): Set<string> {
  const dir = recordingsDir();
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).filter((filename) => isPrimaryRecordingForRoom(filename, roomId)));
}

function newestRecordingForRoom(roomId: string, existingFiles: Set<string>): string | null {
  const dir = recordingsDir();
  if (!fs.existsSync(dir)) return null;
  const candidates = fs.readdirSync(dir)
    .filter((filename) => isPrimaryRecordingForRoom(filename, roomId) && !existingFiles.has(filename))
    .map((filename) => ({ filename, mtimeMs: fs.statSync(path.join(dir, filename)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.filename ?? null;
}

function isPrimaryRecordingForRoom(filename: string, roomId: string): boolean {
  return filename.endsWith('.webm') && filename.includes(`_${roomId}_`) && !filename.includes('_host_');
}

async function dismissDeviceDialogIfOpen(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Check your camera and audio' });
  if (await dialog.isVisible().catch(() => false)) {
    const close = dialog.getByRole('button', { name: 'Close device settings' });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    } else {
      await dialog.getByRole('button', { name: 'Done' }).click();
    }
    await expect(dialog).toBeHidden();
  }
}
