import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix, insertRoom, openE2eDb } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const DIAGH_PREFIX = 'DIAGH';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagh/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGH_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGH_PREFIX);
});

test('DR-23 room search filters by name across pages and preserves room row actions', async ({ page, request }) => {
  const target = await createSearchFixture(request);

  await loginAsJrom(page);
  await page.goto('/app/rooms');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.locator('.room-row')).toHaveCount(20);
  await expect(page.locator('.room-row').filter({ hasText: target.title })).toHaveCount(0);

  const search = page.getByLabel('Search rooms');
  await search.fill('needle');

  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('needle');
  await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe('1');
  const row = page.locator('.room-row').filter({ hasText: target.title }).first();
  await expect(row).toBeVisible();
  await expect(page.locator('.room-row')).toHaveCount(1);
  await expect(page.locator('.rooms-panel .muted')).toHaveText('1 total');
  await expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', new RegExp(`/room/${target.slug}$`));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/rooms-search.png`, fullPage: true });

  await row.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/app\/rooms/);
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('needle');
  await expect(row).toContainText('Closed to guests');

  await search.fill('');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.locator('.room-row')).toHaveCount(20);
});

async function createSearchFixture(request: APIRequestContext): Promise<TestRoom> {
  cleanupRoomsByPrefix(DIAGH_PREFIX);
  const target = await createRoomViaApi(request, `${DIAGH_PREFIX} Remote Needle Match ${Date.now()}`);
  const db = openE2eDb();
  const now = Date.now() + 1_000_000;
  try {
    for (let index = 0; index < 22; index += 1) {
      const id = `d1a6000000${index.toString(16).padStart(2, '0')}`;
      insertRoom(db, id, `${DIAGH_PREFIX} Decoy ${String(index + 1).padStart(2, '0')}`, now + index);
    }
  } finally {
    db.close();
  }
  return target;
}
