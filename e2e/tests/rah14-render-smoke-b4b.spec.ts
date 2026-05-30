import { test, expect } from '@playwright/test';
import { loginAsJrom } from '../fixtures/auth';

// RAH-14 — diagnostics page render-smoke (B4b). Loads /app/diagnostics, asserts
// ZERO console.error and ZERO uncaught pageerror, screenshots the page.
const BASE = process.env.E2E_BASE_URL || 'http://localhost:4700';
const SHOTS = '/home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29/validation/B4/screenshots';

test('RAH-14 diagnostics render-smoke: 0 console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // --- login through the UI (shared fixture; lands on /app/rooms) ---
  await loginAsJrom(page);

  // --- navigate to diagnostics ---
  await page.goto(`${BASE}/app/diagnostics`, { waitUntil: 'networkidle' });
  // root section of the diagnostics page must render
  await expect(page.locator('section').first()).toBeVisible({ timeout: 10000 });

  // give the page a moment to settle any async detail load
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${SHOTS}/diagnostics-render-b4b.png`, fullPage: true });

  // AC-3: if any inbound audio-health element rendered, log it (verdict NOT asserted, NS5)
  const healthEls = await page
    .locator('.audio-recv-ok, .audio-recv-bad, .audio-recv-neutral')
    .count();
  console.log(`RAH-14 audio-health elements in DOM: ${healthEls}`);
  console.log(`RAH-14 console.error count: ${consoleErrors.length}`);
  console.log(`RAH-14 pageerror count: ${pageErrors.length}`);
  if (consoleErrors.length) console.log('console.errors:', JSON.stringify(consoleErrors, null, 2));
  if (pageErrors.length) console.log('pageerrors:', JSON.stringify(pageErrors, null, 2));

  // AC-2: ZERO console errors + ZERO uncaught page errors
  expect(consoleErrors, `console.errors: ${consoleErrors.join(' | ')}`).toHaveLength(0);
  expect(pageErrors, `pageerrors: ${pageErrors.join(' | ')}`).toHaveLength(0);
});
