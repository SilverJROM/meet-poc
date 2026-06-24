import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hashPassword } from '../../../backend/src/lib/passwords.js';
import { openE2eDb } from '../../fixtures/db';

const PREFIX = 'B3BUI';
const SCREENSHOT_DIR = '../plan/WK_0623/projcore-run-2026-06-23/batch-B3b/screenshots';
const USER_EMAIL = `${PREFIX.toLowerCase()}@example.com`;
const TEST_PASSWORD = 'password123';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  seedUser();
});

test.afterAll(() => {
  cleanupUser();
});

test('B3b passwordless login UI proof', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto('/login');
  await page.locator('#login-email').fill(USER_EMAIL);

  await page.route('**/api/telegram/passwordless/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        eligible: true,
        challengeToken: 'ui-proof-token',
        displayNumber: 42,
        expiresAt: Date.now() + 120_000,
        pollAfterMs: 2000,
      }),
    });
  });

  await page.getByRole('button', { name: 'Sign in with Telegram' }).click();
  await expect(page.locator('.tg-number-panel')).toBeVisible();
  await expect(page.locator('.tg-number-value')).toHaveText('42');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/login-number-screen.png`, fullPage: true });

  await page.unroute('**/api/telegram/passwordless/start');
  await page.route('**/api/telegram/passwordless/start', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ eligible: false }),
    });
  });

  await page.reload();
  await page.locator('#login-email').fill(USER_EMAIL);
  await page.getByRole('button', { name: 'Sign in with Telegram' }).click();
  await expect(page.locator('.tg-notice.ineligible')).toContainText('You must activate passwordless login in the app.');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/login-not-enabled.png`, fullPage: true });
});

test('B3b settings passwordless toggle UI proof', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, USER_EMAIL, TEST_PASSWORD);
  await page.goto('/app/settings');

  await expect(page.getByText('Passwordless Telegram login')).toBeVisible();
  await expect(page.getByText('Not activated. Run a one-time test to enable passwordless sign-in.')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-toggle-off.png`, fullPage: true });

  const db = openE2eDb();
  try {
    db.prepare('INSERT OR REPLACE INTO user_passwordless_settings (email, tg_status, updated_at) VALUES (?, ?, ?)')
      .run(USER_EMAIL, 'active', Date.now());
  } finally {
    db.close();
  }

  await page.reload();
  await expect(page.getByText('Active — sign in from the login screen with the Telegram icon')).toBeVisible();
  await page.screenshot({ path: `${SCREENSHOT_DIR}/settings-toggle-active.png`, fullPage: true });
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

function seedUser(): void {
  const db = openE2eDb();
  const now = Date.now();
  try {
    const hash = hashPassword(TEST_PASSWORD);
    const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(USER_EMAIL) as { email: string } | undefined;
    if (existing) {
      db.prepare(
        'UPDATE users SET password_hash = ?, display_name = ?, is_admin = 0, is_superuser = 0, updated_at = ? WHERE email = ?',
      ).run(hash, 'B3B UI User', now, USER_EMAIL);
    } else {
      db.prepare(
        'INSERT INTO users (email, password_hash, created_at, updated_at, display_name, is_admin, is_superuser) VALUES (?, ?, ?, ?, ?, 0, 0)',
      ).run(USER_EMAIL, hash, now, now, 'B3B UI User');
    }
    db.prepare('INSERT OR REPLACE INTO telegram_links (tg_user_id, email, linked_at) VALUES (?, ?, ?)')
      .run(42424242, USER_EMAIL, now);
    db.prepare('DELETE FROM user_passwordless_settings WHERE email = ?').run(USER_EMAIL);
  } finally {
    db.close();
  }
}

function cleanupUser(): void {
  const db = openE2eDb();
  try {
    db.prepare('DELETE FROM sessions WHERE email = ?').run(USER_EMAIL);
    db.prepare('DELETE FROM user_passwordless_settings WHERE email = ?').run(USER_EMAIL);
    db.prepare('DELETE FROM telegram_links WHERE email = ?').run(USER_EMAIL);
    db.prepare('DELETE FROM users WHERE email = ?').run(USER_EMAIL);
  } finally {
    db.close();
  }
}