import { expect, test } from '@playwright/test';

test('S3.4 /app/rooms is guarded', async ({ page }) => {
  await page.goto('/app/rooms');
  await expect(page).toHaveURL(/\/login$/);
});

test('S3.4 /app/ongoing is guarded through the parent route', async ({ page }) => {
  await page.goto('/app/ongoing');
  await expect(page).toHaveURL(/\/login$/);
});
