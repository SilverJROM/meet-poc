import path from 'node:path';
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { email, initialPassword } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';
import { cleanupRoomsByPrefix } from '../../fixtures/db';

// B2b: rung-4 visible-unrecovered UI rendered proof. The rejoin/throttle MECHANISM is proven in the
// fake-timed sfu-recovery-coordinator.spec.ts (COALESCING/THROTTLE/EPOCH-SAFETY/RESUBSCRIBE-ALL); this
// spec only needs to prove the banner actually renders — a single solo host is enough, driven via the
// localhost-gated debug hook rather than a real 2-browser rejoin-throttle exhaustion.
const B2B_PREFIX = 'SFUB2BREJOIN';
const SCREENSHOT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-B2b/screenshots';

// NOT using the shared fixtures/auth.ts loginAsJrom() here: since 1fbc273 (WK_0623 passwordless-TG
// login) the login page has TWO "Sign in" buttons (password submit + "Sign in with Telegram"), which
// makes that helper's getByRole('button', { name: 'Sign in' }) ambiguous and throws — a pre-existing,
// unrelated bug in the shared fixture (flagged in this batch's changes.md), out of this batch's scope
// to fix. Scoped locally here with an exact-match button selector instead.
async function loginAsJromExact(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

test.setTimeout(60_000);

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupRoomsByPrefix(B2B_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B2B_PREFIX);
});

test('B2b: rung-4 audio-unrecovered banner renders with an actionable Retry button', async ({ page, request }) => {
  await loginAsJromExact(page);
  const room = await createRoomViaApi(request, `${B2B_PREFIX} ${Date.now()}`);

  await page.goto(room.url);
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('#display-name').fill('b2b-host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // No banner before the rejoin throttle is exceeded.
  await expect(page.locator('.sfu-rejoin-unrecovered-notice')).toHaveCount(0);

  await page.evaluate(() => (window as any).__meetDebug?.forceSfuRejoinThrottledForTest?.());

  const notice = page.locator('.sfu-rejoin-unrecovered-notice');
  await expect(notice).toBeVisible({ timeout: 5_000 });
  await expect(notice.getByRole('button', { name: 'Retry' })).toBeVisible();

  await page.screenshot({ path: path.resolve(process.cwd(), SCREENSHOT_DIR, 'rung4-unrecovered-banner.png') });

  // Retry is actionable — clicking it must not throw / crash the call.
  await notice.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
});
