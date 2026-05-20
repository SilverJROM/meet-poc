import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.3 transcripts page is reachable from the shell', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/transcripts');
  await expect(page.getByRole('heading', { name: 'Transcripts', level: 2 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh transcripts' })).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-3/screenshots/app-transcripts-stub.png',
    fullPage: true,
  });
});

test('S3.3 settings page is reachable from the shell', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/app/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'LLM Provider Default' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Question Library' })).toBeVisible();
  await page.screenshot({
    path: '../plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/batch-3/screenshots/app-settings-stub.png',
    fullPage: true,
  });
});
