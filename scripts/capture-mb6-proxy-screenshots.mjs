#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { chromium } from 'playwright';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = process.env.MB6_BASE_URL || 'https://voice.silverjrom.app';
const OUT_DIR = path.join(
  ROOT_DIR,
  'plan/WK_0519/meet-v3-mobile/projcore-run-2026-05-19-v3-mobile/batch-6/screenshots',
);
const EMAIL = 'jrom@silverjrom.app';

function initialPassword() {
  const candidates = [
    path.join(ROOT_DIR, 'INITIAL_PASSWORD.txt'),
    path.join(ROOT_DIR, '..', 'INITIAL_PASSWORD.txt'),
  ];
  const passwordPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!passwordPath) throw new Error('INITIAL_PASSWORD.txt not found');
  const lines = fs.readFileSync(passwordPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  return lines[0];
}

function testRoomId() {
  const dbPath = process.env.MEET_DB_PATH || path.join(ROOT_DIR, 'data/meet-poc.sqlite');
  const db = new Database(dbPath);
  try {
    const row = db
      .prepare('SELECT id FROM rooms WHERE owner_email = ? AND title = ? ORDER BY created_at DESC LIMIT 1')
      .get(EMAIL, 'TEST_ROOM01');
    if (!row?.id) throw new Error('TEST_ROOM01 not found in local database');
    return row.id;
  } finally {
    db.close();
  }
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/app\/rooms$/, { timeout: 15000 });
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(750);
}

async function shot(page, name) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true });
}

async function safeClick(locator) {
  if ((await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false))) {
    await locator.first().click();
    return true;
  }
  return false;
}

const viewports = [
  {
    slug: 'iphone14',
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    slug: 'pixel7',
    width: 412,
    height: 915,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
  },
  {
    slug: 'desktop',
    width: 1920,
    height: 1080,
    isMobile: false,
    hasTouch: false,
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

const roomId = testRoomId();
const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
});

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.isMobile,
      hasTouch: viewport.hasTouch,
      userAgent: viewport.userAgent,
      ignoreHTTPSErrors: true,
      permissions: ['camera', 'microphone'],
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${viewport.slug}-login.png`);

    await login(page);
    await shot(page, `${viewport.slug}-app-rooms.png`);

    await page.goto(`${BASE_URL}/app/ongoing`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${viewport.slug}-app-ongoing.png`);

    await page.goto(`${BASE_URL}/app/recordings`, { waitUntil: 'domcontentloaded' });
    await shot(page, `${viewport.slug}-app-recordings.png`);

    await page.goto(`${BASE_URL}/room/${roomId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.lobby-panel').waitFor({ timeout: 15000 });
    await shot(page, `${viewport.slug}-room-lobby.png`);

    await safeClick(page.getByRole('button', { name: 'Tap to enable mic preview' }));
    await shot(page, `${viewport.slug}-room-lobby-pill-tapped.png`);

    const displayName = page.locator('#display-name');
    if ((await displayName.count()) > 0) {
      await displayName.fill(`MB6 ${viewport.slug}`);
    }
    await page.getByRole('button', { name: /^Join$/ }).click();
    await page.locator('.call-panel').waitFor({ timeout: 20000 });
    await shot(page, `${viewport.slug}-room-in-call.png`);

    await context.close();
  }
} finally {
  await browser.close();
}

console.log(`Captured ${viewports.length * 7} screenshots in ${path.relative(ROOT_DIR, OUT_DIR)}`);
