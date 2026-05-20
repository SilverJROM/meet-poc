import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinOwnerCall } from '../../fixtures/rooms';

test('S5.2 stop uploads webm and dashboard lists it', async ({ page }) => {
  const room = await createRoomFromDashboard(page, `Recording upload ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(2200);

  const [uploadResponse, uploadRequest] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST'),
    page.waitForRequest((req) => req.url().endsWith('/upload') && req.method() === 'POST'),
    page.getByRole('button', { name: 'Stop recording' }).click(),
  ]);
  expect(uploadRequest.headers()['x-ext']).toBe('webm');
  expect(uploadRequest.headers()['x-room']).toBe(room.id);
  const uploadJson = await uploadResponse.json();
  expect(uploadJson.file).toContain(room.id);
  const recordingPath = path.resolve('..', 'recordings', uploadJson.file);
  expect(fs.existsSync(recordingPath)).toBe(true);
  expect(fs.statSync(recordingPath).size).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'Leave but keep meeting going' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  const row = page.locator('.recording-row').filter({ hasText: room.title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /\/api\/recordings\/.*\/download$/);
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-5/screenshots/dashboard-recordings-list.png', fullPage: true });
});
