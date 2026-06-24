import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hashPassword } from '../../../backend/src/lib/passwords.js';
import { openE2eDb } from '../../fixtures/db';

const PREFIX = 'B2BUI';
const SCREENSHOT_DIR = '../plan/WK_0623/projcore-run-2026-06-23/batch-B2b/screenshots';
const SUPERUSER_EMAIL = 'silverjrom@gmail.com';
const ADMIN_EMAIL = `${PREFIX.toLowerCase()}-admin@example.com`;
const TARGET_EMAIL = `${PREFIX.toLowerCase()}-target@example.com`;
const TEST_PASSWORD = 'password123';

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  seedUsers();
});

test.afterAll(() => {
  cleanupUsers();
});

test('B2b admin UI shows protected row and god-mode confirm dialog', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, ADMIN_EMAIL, TEST_PASSWORD);
  await page.goto('/app/admin');

  const protectedRow = page.locator('.user-row.protected').filter({ hasText: SUPERUSER_EMAIL });
  await expect(protectedRow).toBeVisible();
  await expect(protectedRow.getByText('Protected')).toBeVisible();
  await expect(protectedRow.getByRole('button')).toHaveCount(0);
  await expect(protectedRow.getByText('Admin')).toBeVisible();

  await page.screenshot({ path: `${SCREENSHOT_DIR}/admin-protected-row.png`, fullPage: true });

  await page.context().clearCookies();
  await login(page, SUPERUSER_EMAIL, TEST_PASSWORD);
  await page.goto('/app/admin');

  const targetRow = page.locator('.user-row').filter({ hasText: TARGET_EMAIL });
  await expect(targetRow.getByRole('button', { name: 'Username' })).toBeVisible();
  await expect(targetRow.getByRole('button', { name: 'Email' })).toBeVisible();
  await expect(targetRow.getByRole('button', { name: 'Role' })).toBeVisible();
  await expect(targetRow.getByRole('button', { name: 'Reset password' })).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    await dialog.accept('B2B Renamed');
  });

  await targetRow.getByRole('button', { name: 'Username' }).click();
  const confirmModal = page.locator('.confirm-modal');
  await expect(confirmModal).toBeVisible();
  await expect(confirmModal).toContainText('Change username');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/god-mode-confirm.png`, fullPage: true });
  await confirmModal.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirmModal).toBeHidden();
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

function seedUsers(): void {
  const db = openE2eDb();
  const now = Date.now();
  try {
    upsertUser(db, SUPERUSER_EMAIL, {
      displayName: 'JROM',
      isAdmin: true,
      isSuperuser: true,
      password: TEST_PASSWORD,
      createdAt: now - 10_000,
    });
    upsertUser(db, ADMIN_EMAIL, {
      displayName: 'B2B Admin',
      isAdmin: true,
      isSuperuser: false,
      password: TEST_PASSWORD,
      createdAt: now - 5_000,
    });
    upsertUser(db, TARGET_EMAIL, {
      displayName: 'B2B Target',
      isAdmin: false,
      isSuperuser: false,
      password: TEST_PASSWORD,
      createdAt: now - 1_000,
    });
  } finally {
    db.close();
  }
}

function cleanupUsers(): void {
  const db = openE2eDb();
  try {
    for (const email of [ADMIN_EMAIL, TARGET_EMAIL]) {
      db.prepare('DELETE FROM sessions WHERE email = ?').run(email);
      db.prepare('DELETE FROM users WHERE email = ?').run(email);
    }
  } finally {
    db.close();
  }
}

function upsertUser(
  db: ReturnType<typeof openE2eDb>,
  email: string,
  opts: {
    displayName: string;
    isAdmin: boolean;
    isSuperuser: boolean;
    password: string;
    createdAt: number;
  },
): void {
  const hash = hashPassword(opts.password);
  const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(email) as { email: string } | undefined;
  if (existing) {
    db.prepare(
      'UPDATE users SET password_hash = ?, display_name = ?, is_admin = ?, is_superuser = ?, updated_at = ? WHERE email = ?',
    ).run(hash, opts.displayName, opts.isAdmin ? 1 : 0, opts.isSuperuser ? 1 : 0, Date.now(), email);
    return;
  }
  db.prepare(
    'INSERT INTO users (email, password_hash, created_at, updated_at, display_name, is_admin, is_superuser) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    email,
    hash,
    opts.createdAt,
    opts.createdAt,
    opts.displayName,
    opts.isAdmin ? 1 : 0,
    opts.isSuperuser ? 1 : 0,
  );
}