import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.1 root redirects authenticated users to /app/rooms', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('S3.2 /dashboard redirects to /app/rooms', async ({ page }) => {
  await loginAsJrom(page);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await expect(page.getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');
});
