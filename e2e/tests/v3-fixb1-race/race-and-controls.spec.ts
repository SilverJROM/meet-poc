import fs from 'node:fs';
import path from 'node:path';
import { expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { loginAsJrom } from '../../fixtures/auth';
import { cleanupRecordingsByPrefix, cleanupRoomsByPrefix } from '../../fixtures/db';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

const FIXB1_PREFIX = 'FIXB1';
const SCREENSHOT_DIR = '../plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixb/batch-fixb1/screenshots';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(path.resolve(process.cwd(), SCREENSHOT_DIR), { recursive: true });
  cleanupFixb1Artifacts();
});

test.afterAll(() => {
  cleanupFixb1Artifacts();
});

test('FIX-B1.3 controls are visibly distinct on the light controls bar', async ({ request, page }) => {
  const room = await createFixRoom(request, 'controls');
  await loginAsJrom(page);
  await joinOwnerWithCamera(page, room, 'host');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/controls-light.png`, fullPage: true });

  const contrast = await page.evaluate(() => {
    const button = document.querySelector('.control-btn');
    const bar = document.querySelector('.controls-bar');
    if (!button || !bar) throw new Error('controls not found');
    return {
      buttonBg: getComputedStyle(button).backgroundColor,
      barBg: getComputedStyle(bar).backgroundColor,
      buttonBorder: getComputedStyle(button).borderColor,
    };
  });
  expect(maxRgbDelta(contrast.buttonBg, contrast.barBg)).toBeGreaterThanOrEqual(8);
  expect(contrast.buttonBorder).not.toBe('rgb(216, 221, 230)');
});

test('FIX-B1.4 background video pause requires mobile viewport and mobile UA', async ({ browser, request }) => {
  const desktopRoom = await createFixRoom(request, 'desktop-ua-gate');
  const desktopContext = await browser.newContext({
    viewport: { width: 800, height: 600 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const desktop = await desktopContext.newPage();
  await loginAsJrom(desktop);
  await joinOwnerWithCamera(desktop, desktopRoom, 'desktop-host');
  await setVisibility(desktop, 'hidden');
  await expect.poll(() => localVideoEnabled(desktop)).toBe(true);
  await desktopContext.close();

  const mobileRoom = await createFixRoom(request, 'mobile-ua-gate');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const mobile = await mobileContext.newPage();
  await loginAsJrom(mobile);
  await joinOwnerWithCamera(mobile, mobileRoom, 'mobile-host');
  await setVisibility(mobile, 'hidden');
  await expect.poll(() => localVideoEnabled(mobile)).toBe(false);
  await mobileContext.close();
});

async function createFixRoom(request: APIRequestContext, suffix: string): Promise<TestRoom> {
  return createRoomViaApi(request, `${FIXB1_PREFIX} ${suffix} ${Date.now()}`);
}

async function joinOwnerWithCamera(page: Page, room: TestRoom, name: string): Promise<void> {
  await page.goto(room.url);
  await expect(page.getByRole('heading', { name: room.title })).toBeVisible();
  await page.getByLabel('Start with camera on').check();
  await expect.poll(() => page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks().length || 0)).toBeGreaterThan(0);
  await page.locator('#display-name').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.locator('.call-panel')).toBeVisible();
}

async function localVideoEnabled(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => window.__meetDebug?.localStream?.getVideoTracks()[0]?.enabled);
}

async function setVisibility(page: Page, visibilityState: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { get: () => state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visibilityState);
}

function maxRgbDelta(a: string, b: string): number {
  const left = rgb(a);
  const right = rgb(b);
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
}

function rgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`not an rgb color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function cleanupFixb1Artifacts(): void {
  cleanupRoomsByPrefix(FIXB1_PREFIX);
  cleanupRecordingsByPrefix(FIXB1_PREFIX);
}
