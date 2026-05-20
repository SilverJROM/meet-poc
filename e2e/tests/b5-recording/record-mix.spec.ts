import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createRoomFromDashboard, joinGuestAndWait, joinOwnerCall } from '../../fixtures/rooms';

test('S5.3 recording with a peer produces a webm with an audio stream', async ({ browser, page }) => {
  const room = await createRoomFromDashboard(page, `Recording mix ${Date.now()}`);
  await joinOwnerCall(page, room, 'host');

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await joinGuestAndWait(guest, room, 'guest');
  await page.getByRole('button', { name: 'Admit' }).click();
  await expect(page.locator('app-tile')).toHaveCount(2);
  await expect(guest.locator('app-tile')).toHaveCount(2);
  await expect(page.locator('app-tile').filter({ hasText: 'guest' }).locator('.state')).toHaveText('connected', { timeout: 10000 });

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(2400);
  const [uploadResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/upload') && res.request().method() === 'POST'),
    page.getByRole('button', { name: 'Stop recording' }).click(),
  ]);
  const uploadJson = await uploadResponse.json();
  const recordingPath = path.resolve('..', 'recordings', uploadJson.file);
  expect(fs.statSync(recordingPath).size).toBeGreaterThan(1000);

  await page.getByRole('button', { name: 'Leave call' }).click();
  await page.getByRole('button', { name: 'Leave but keep meeting going' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  const href = await page.locator('.recording-row').filter({ hasText: room.title }).getByRole('link', { name: 'Download' }).first().getAttribute('href');
  if (!href) throw new Error('download href missing');
  const download = await page.request.get(href);
  expect(download.ok()).toBeTruthy();
  const downloadPath = test.info().outputPath('mix.webm');
  fs.writeFileSync(downloadPath, await download.body());

  const probe = spawnSync('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a',
    '-show_entries',
    'stream=codec_name,duration',
    '-of',
    'csv=p=0',
    downloadPath,
  ]);
  expect(probe.status, probe.stderr.toString()).toBe(0);
  expect(probe.stdout.toString()).toContain('opus');

  await guestContext.close();
});
