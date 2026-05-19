import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const email = 'jrom@silverjrom.app';

export function initialPassword(): string {
  const candidates = [
    path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'),
    path.resolve(process.cwd(), '..', 'INITIAL_PASSWORD.txt'),
  ];
  const passwordPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!passwordPath) throw new Error('INITIAL_PASSWORD.txt not found');
  const lines = fs.readFileSync(passwordPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  return lines[0];
}

export async function loginAsJrom(page: Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}
