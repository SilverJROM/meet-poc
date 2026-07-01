import path from 'node:path';
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { email, initialPassword } from '../../fixtures/auth';
import { createRoomViaApi } from '../../fixtures/rooms';
import { cleanupRoomsByPrefix } from '../../fixtures/db';

// R4/B4: publish-recovery-unrecoverable UI rendered proof (the "Glory case" — an admitted client
// whose own publish never established, hasPc:false / status null|'error'). The escalate/throttle
// MECHANISM is proven in the fake-timed sfu-recovery-coordinator.spec.ts (NEVER-PUBLISHED-ESCALATE /
// NO-CLOBBER-HEALTHY / NO-CLOBBER-IN-FLIGHT / UNRECOVERABLE-ON-FAILURE / CAPPED-WIRES-TO-ESCALATE /
// THROTTLE-SHARED); this spec only needs to prove the terminal notice actually renders — driven via
// the localhost-gated debug hook rather than a real escalate-then-throttle exhaustion.
const B4_PREFIX = 'SFUB4PUBLISH';
const SCREENSHOT_DIR = '../plan/WK_0701/projcore-run-2026-07-01/batch-B4/screenshots';

// See sfu-b2b-rejoin-ui/sfu-rejoin-ui.spec.ts for why this doesn't use the shared loginAsJrom().
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
  cleanupRoomsByPrefix(B4_PREFIX);
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B4_PREFIX);
});

test('B4: publish-recovery-unrecoverable notice renders with an actionable Rejoin button', async ({ page, request }) => {
  await loginAsJromExact(page);
  const room = await createRoomViaApi(request, `${B4_PREFIX} ${Date.now()}`);

  await page.goto(room.url);
  await expect(page.locator('#display-name')).toBeVisible({ timeout: 10_000 });
  await page.locator('#display-name').fill('b4-host');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });

  // No notice before an escalated publish-recovery attempt is exhausted.
  await expect(page.locator('.publish-recovery-unrecoverable-notice')).toHaveCount(0);

  await page.evaluate(() => (window as any).__meetDebug?.forcePublishRecoveryFailedForTest?.());

  const notice = page.locator('.publish-recovery-unrecoverable-notice');
  await expect(notice).toBeVisible({ timeout: 5_000 });
  await expect(notice).toContainText("We couldn't restore your audio automatically");
  await expect(notice.getByRole('button', { name: 'Rejoin' })).toBeVisible();

  await page.screenshot({ path: path.resolve(process.cwd(), SCREENSHOT_DIR, 'b4-publish-recovery-unrecoverable-notice.png') });
});
