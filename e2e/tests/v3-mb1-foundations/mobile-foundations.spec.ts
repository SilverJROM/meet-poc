import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  MB1_SCREENSHOT_DIR,
  addKnocker,
  admitBrowserGuest,
  cleanupMb1Artifacts,
  createAndJoinOwner,
  createMb1Room,
  expectTouchTarget,
  openParticipants,
  prepareMb1Evidence,
} from './helpers';
import { joinOwnerCall } from '../../fixtures/rooms';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  prepareMb1Evidence();
  cleanupMb1Artifacts();
});

test.afterAll(() => {
  cleanupMb1Artifacts();
});

test('M1.1 viewport audit uses 100dvh fallbacks and no app-local raw media queries', async () => {
  const repoRoot = path.resolve(process.cwd(), '..');
  const files = collectFiles(path.join(repoRoot, 'frontend', 'src')).filter((file) => /\.(scss|html)$/.test(file));
  const unresolvedVh: string[] = [];
  const rawMediaQueries: string[] = [];

  for (const file of files) {
    const rel = path.relative(repoRoot, file);
    const text = fs.readFileSync(file, 'utf8');
    if (/100[ls]vh/.test(text)) unresolvedVh.push(`${rel}: contains lvh/svh`);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes('@media') && rel !== 'frontend/src/styles/_breakpoints.scss') rawMediaQueries.push(`${rel}:${index + 1}`);
      if (line.includes('100vh') && !nearbyContains(lines, index, '100dvh')) unresolvedVh.push(`${rel}:${index + 1}: ${line.trim()}`);
    });
  }

  expect(unresolvedVh).toEqual([]);
  expect(rawMediaQueries).toEqual([]);
  const index = fs.readFileSync(path.join(repoRoot, 'frontend', 'src', 'index.html'), 'utf8');
  expect(index).toContain('viewport-fit=cover');
});

test('M1.2 exposes debounced mobile/platform debug signals', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isMobile?.())).toBe(true);
  await expect(page.evaluate(() => typeof window.__meetDebug?.isIOS)).resolves.toBe('function');
  await expect(page.evaluate(() => typeof window.__meetDebug?.isAndroid)).resolves.toBe('function');

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isMobile?.()), { timeout: 2000 }).toBe(false);
});

test('M1.3 mobile lobby and call controls meet the 48px narrowed touch target contract', async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const room = await createMb1Room(page, 'touch-targets');
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();

  await expectTouchTarget(page.locator('#display-name'), 'lobby display name');
  await expectTouchTarget(page.locator('.toggle-row').filter({ hasText: 'Start with camera on' }), 'camera checkbox row');
  await expectTouchTarget(page.getByRole('button', { name: 'Join' }), 'lobby join button');
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expectTouchTarget(page.locator('.mic-select'), 'microphone selector');
  await expectTouchTarget(page.locator('.camera-select'), 'camera selector');
  await page.screenshot({ path: `${MB1_SCREENSHOT_DIR}/mobile-lobby-390x844.png`, fullPage: true });

  await joinOwnerCall(page, room, 'host');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isMobile?.())).toBe(true);
  await expectTouchTarget(page.getByRole('button', { name: /microphone/i }), 'mic control');
  await expectTouchTarget(page.getByRole('button', { name: /camera/i }), 'camera control');
  await expectTouchTarget(page.getByRole('button', { name: 'Share screen' }), 'screen control');
  await expectTouchTarget(page.getByRole('button', { name: 'Record' }), 'record control');
  await expectTouchTarget(page.getByRole('button', { name: 'Show participants' }), 'participants control');
  await expectTouchTarget(page.getByRole('button', { name: 'Leave call' }), 'leave control');

  const admittedGuest = await admitBrowserGuest(browser, page, room, 'guest-a');
  const knocker = await addKnocker(browser, room, 'guest-waiting');
  await openParticipants(page);
  const guestRow = page.getByLabel('In the call').locator('li').filter({ hasText: 'guest-a' });
  await expectTouchTarget(guestRow.getByRole('button', { name: /Actions for .*guest-a/ }), 'participant kebab');
  const waitingRow = page.getByLabel('Waiting to join').locator('li').filter({ hasText: 'guest-waiting' });
  await expectTouchTarget(waitingRow.getByRole('button', { name: 'Admit' }), 'admit button');
  await expectTouchTarget(waitingRow.getByRole('button', { name: 'Reject' }), 'reject button');
  await page.screenshot({ path: `${MB1_SCREENSHOT_DIR}/mobile-call-sidebar-390x844.png`, fullPage: true });

  await admittedGuest.context().close();
  await knocker.context().close();
});

test('M1.4 desktop layout remains desktop-sized and mobile-only target changes do not leak', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const room = await createAndJoinOwner(page, 'desktop-regression');
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.isMobile?.())).toBe(false);
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mute microphone' })).toHaveCSS('width', '46px');
  await page.screenshot({ path: `${MB1_SCREENSHOT_DIR}/desktop-call-1920x1080.png`, fullPage: true });
  await page.goto('/app/rooms');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.screenshot({ path: `${MB1_SCREENSHOT_DIR}/desktop-rooms-1920x1080.png`, fullPage: true });
  expect(room.id).toBeTruthy();
});

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

function nearbyContains(lines: string[], index: number, needle: string): boolean {
  return lines.slice(index, index + 3).some((line) => line.includes(needle));
}
