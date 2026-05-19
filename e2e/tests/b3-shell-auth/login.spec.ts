import { expect, test } from '@playwright/test';
import { email, initialPassword } from '../../fixtures/auth';

test('S3.1 login page renders, login succeeds, and navigates to rooms app', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('.login-card')).toBeVisible();
  await page.screenshot({ path: '../plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/batch-3/screenshots/login-page.png', fullPage: true });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
  await expect(page.locator('.app-topbar')).toContainText(email);
  await expect(page.locator('.login-card')).toHaveCount(0);
});
