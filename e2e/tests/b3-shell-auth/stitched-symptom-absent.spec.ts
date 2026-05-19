import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.5 no login form exists in the DOM after authentication', async ({ page }) => {
  await loginAsJrom(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create room' })).toBeVisible();
});
