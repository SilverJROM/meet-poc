import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

export const MB4_PREFIX = 'MB4LOBBY';
export const MB4_SCREENSHOT_DIR = '../plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-4/screenshots';

export function prepareMb4Evidence(): void {
  fs.mkdirSync(path.resolve(process.cwd(), MB4_SCREENSHOT_DIR), { recursive: true });
}

export function cleanupMb4Artifacts(): void {
  cleanupRoomsByPrefix(MB4_PREFIX);
  cleanupRecordingsByPrefix(MB4_PREFIX);
}

export async function createMb4Room(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${MB4_PREFIX} ${suffix} ${Date.now()}`);
}

export async function gotoOwnedMb4Lobby(page: Page, request: APIRequestContext, suffix: string): Promise<TestRoom> {
  const room = await createMb4Room(request, suffix);
  await loginAsJrom(page);
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await expect(page.locator('app-lobby-preview')).toBeVisible();
  return room;
}

export async function enableLobbyCamera(page: Page): Promise<void> {
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await expect(page.locator('app-lobby-preview video')).toBeVisible();
}
