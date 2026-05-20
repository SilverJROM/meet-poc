import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi } from '../../fixtures/rooms';

const DIAGE1_PREFIX = 'DIAGE1';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diage1/screenshots';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(DIAGE1_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(DIAGE1_PREFIX);
});

test('DR-14 clicking a room row navigates to its slug URL', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGE1_PREFIX} Row Click ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto('/app/rooms');
  const row = page.locator('.room-row').filter({ hasText: room.title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', new RegExp(`/room/${room.slug}$`));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/rooms-clickable.png`, fullPage: true });

  await row.locator('.room-main').click();

  await expect(page).toHaveURL(new RegExp(`/room/${room.slug}$`));
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/room-url-slug.png`, fullPage: true });
});

test('DR-14 row actions do not trigger row navigation', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGE1_PREFIX} Delete Action ${Date.now()}`);
  await loginAsJrom(page);
  await page.goto('/app/rooms');
  const row = page.locator('.room-row').filter({ hasText: room.title }).first();
  await expect(row).toBeVisible();
  page.once('dialog', (dialog) => dialog.dismiss());

  await row.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(/\/app\/rooms/);
  await expect(row).toBeVisible();
});

test('DR-15 legacy id URL still opens the room after slug routing', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGE1_PREFIX} Legacy Id ${Date.now()}`);

  await page.goto(`/room/${room.id}`);

  await expect(page).toHaveURL(new RegExp(`/room/${room.id}$`));
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
});

test('DR-15 owner custom slug opens and replaces the rooms-list URL', async ({ page, request }) => {
  const room = await createRoomViaApi(request, `${DIAGE1_PREFIX} Vanity ${Date.now()}`);
  const customSlug = `diage1-vanity-${Date.now()}`;
  const res = await request.put(`/api/rooms/${room.id}/slug`, { data: { slug: customSlug } });
  expect(res.ok()).toBeTruthy();

  await loginAsJrom(page);
  await page.goto('/app/rooms');
  const row = page.locator('.room-row').filter({ hasText: room.title }).first();
  await expect(row.getByRole('link', { name: 'Join' })).toHaveAttribute('href', new RegExp(`/room/${customSlug}$`));

  await page.goto(`/room/${customSlug}`);

  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
});
