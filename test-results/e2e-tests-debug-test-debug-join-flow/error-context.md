# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e/tests/debug-test.spec.ts >> debug join flow
- Location: e2e/tests/debug-test.spec.ts:6:1

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/login", waiting until "load"

```

# Test source

```ts
  1  | import fs from 'node:fs';
  2  | import path from 'node:path';
  3  | import { expect, type Page } from '@playwright/test';
  4  | 
  5  | export const email = 'jrom@silverjrom.app';
  6  | 
  7  | export function initialPassword(): string {
  8  |   const candidates = [
  9  |     path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'),
  10 |     path.resolve(process.cwd(), '..', 'INITIAL_PASSWORD.txt'),
  11 |   ];
  12 |   const passwordPath = candidates.find((candidate) => fs.existsSync(candidate));
  13 |   if (!passwordPath) throw new Error('INITIAL_PASSWORD.txt not found');
  14 |   const lines = fs.readFileSync(passwordPath, 'utf8').split(/\r?\n/).filter(Boolean);
  15 |   if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  16 |   return lines[0];
  17 | }
  18 | 
  19 | export async function loginAsJrom(page: Page): Promise<void> {
> 20 |   await page.goto('/login');
     |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  21 |   await page.locator('#login-email').fill(email);
  22 |   await page.locator('#login-password').fill(initialPassword());
  23 |   await page.getByRole('button', { name: 'Sign in' }).click();
  24 |   await expect(page).toHaveURL(/\/app\/rooms$/);
  25 | }
  26 | 
```