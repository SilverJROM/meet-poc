import fs from 'node:fs';
import path from 'node:path';
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const DIAGD_PREFIX = 'DIAGD';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagd/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGD_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGD_PREFIX);
});

test('DR-12 join button stays clickable and names missing name only', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} name ${Date.now()}`);
  await page.goto(room.url);
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks().length || 0), { timeout: 8000 }).toBeGreaterThan(0);

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please add your name');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-name.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toHaveCount(0);
});

test('DR-12 blocked microphone names mic only even when camera is requested', async ({ page, request }) => {
  await blockMicrophone(page.context());
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} mic ${Date.now()}`);
  await page.goto(room.url);
  await page.locator('#display-name').fill('mic-blocked');
  await page.locator('input[name="cameraRequested"]').check({ force: true });

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please enable your microphone');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-mic.png`, fullPage: true });
  await page.getByRole('button', { name: 'Dismiss join requirements' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toHaveCount(0);
});

test('DR-12 missing name and mic names both prerequisites', async ({ page, request }) => {
  await blockMicrophone(page.context());
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} both ${Date.now()}`);
  await page.goto(room.url);

  const joinButton = page.getByRole('button', { name: 'Ask to join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.getByRole('alertdialog', { name: 'Join requirements' })).toContainText('Please add your name and enable your microphone');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/join-popout-both.png`, fullPage: true });
});

test('DR-12 satisfied prerequisites join even when the user starts muted', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGD_PREFIX} muted ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto(room.url);
  await page.locator('#display-name').fill('host-muted');
  await page.locator('input[name="microphoneRequested"]').uncheck({ force: true });

  const joinButton = page.getByRole('button', { name: 'Join' });
  await expect(joinButton).toBeEnabled();
  await joinButton.click();

  await expect(page.locator('.call-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getAudioTracks()[0]?.enabled), { timeout: 5000 }).toBe(false);
});

async function blockMicrophone(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        ...original,
        enumerateDevices: async () => [
          { deviceId: 'blocked-mic', groupId: 'blocked', kind: 'audioinput', label: 'Blocked microphone', toJSON: () => ({}) },
          { deviceId: 'camera', groupId: 'camera', kind: 'videoinput', label: 'Camera', toJSON: () => ({}) },
        ],
        getUserMedia: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError');
        },
      },
    });
  });
}
