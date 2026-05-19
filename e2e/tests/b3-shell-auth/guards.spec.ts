import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.2 app rooms without session redirects to login', async ({ page }) => {
  await page.goto('/app/rooms');
  await expect(page).toHaveURL(/\/login$/);
});

test('S3.3 login with active session redirects to rooms app', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/app\/rooms$/);
});
