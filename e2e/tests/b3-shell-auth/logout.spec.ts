import { expect, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';

test('S3.6 logout clears session and routes to login', async ({ page }) => {
  await loginAsJrom(page);
  await page.getByRole('button', { name: /Logout/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  const me = await page.evaluate(() => fetch('/api/me', { credentials: 'same-origin' }).then((res) => res.json()));
  expect(me).toEqual({ user: null });
});
