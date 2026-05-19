import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.2 dashboard without session redirects to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('S3.3 login with active session redirects to dashboard', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
});
