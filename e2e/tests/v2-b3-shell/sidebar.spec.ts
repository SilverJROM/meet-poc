import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

const navItems = [
  { label: 'Rooms', url: /\/app\/rooms$/, heading: 'Create a room' },
  { label: 'Ongoing meetings', url: /\/app\/ongoing$/, heading: 'Ongoing meetings' },
  { label: 'Past meetings', url: /\/app\/past$/, heading: 'Past meetings' },
  { label: 'Recordings', url: /\/app\/recordings$/, heading: 'Recordings' },
  { label: 'Transcripts', url: /\/app\/transcripts$/, heading: 'Transcripts' },
  { label: 'Settings', url: /\/app\/settings$/, heading: 'Settings' },
];

test('S3.2 sidebar exposes six tabs with active route state', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/rooms');

  await expect(page.locator('.app-shell')).toHaveClass(/is-collapsed/);
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-3/screenshots/app-rooms-sidebar-collapsed.png',
    fullPage: true,
  });
  for (const item of navItems) {
    await expect(page.getByRole('link', { name: item.label })).toBeVisible();
  }

  await expect(page.getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');

  for (const item of navItems) {
    await page.getByRole('link', { name: item.label }).click();
    await expect(page).toHaveURL(item.url);
    await expect(page.getByRole('heading', { name: item.heading, level: 2 })).toBeVisible();
  }
});

test('S3.2 sidebar collapse toggle opens and remembers preference', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/rooms');

  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/is-collapsed/);
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-3/screenshots/app-rooms-sidebar-open.png',
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator('.app-shell')).not.toHaveClass(/is-collapsed/);
});
