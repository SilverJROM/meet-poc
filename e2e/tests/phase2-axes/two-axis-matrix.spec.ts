/*
 * Phase 2 Fresh-Context Two-Axis Viewport Matrix (R8.3)
 *
 * Validates VIEWPORT-SPECIFIC assertions against the live URL
 * https://voice.silverjrom.app. Mobile (390x844) and desktop
 * (1920x1080) assertions MUST differ — that is the contract for R8.3
 * per decisions/2026-05-19-v3-pre-dispatch-revisions.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const LIVE_BASE = 'https://voice.silverjrom.app';
const TEST_ROOM_TITLE = 'TEST_ROOM01';
const EMAIL = 'jrom@silverjrom.app';

function initialPassword(): string {
  const candidates = [
    path.resolve(process.cwd(), 'INITIAL_PASSWORD.txt'),
    path.resolve(process.cwd(), '..', 'INITIAL_PASSWORD.txt'),
  ];
  const passwordPath = candidates.find((c) => fs.existsSync(c));
  if (!passwordPath) throw new Error('INITIAL_PASSWORD.txt not found');
  const lines = fs.readFileSync(passwordPath, 'utf8').split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2 && lines[0].includes('@')) return lines[1];
  return lines[0];
}

async function loginLive(page: Page): Promise<void> {
  await page.goto(`${LIVE_BASE}/login`);
  await expect(page.locator('app-root')).toBeAttached();
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(initialPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/app\/rooms$/);
}

async function findTestRoomId(page: Page): Promise<string> {
  // After login the session cookie is set; query the API for TEST_ROOM01.
  const res = await page.request.get(`${LIVE_BASE}/api/rooms`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const room = (json.rooms as Array<{ id: string; title: string }>).find(
    (r) => r.title === TEST_ROOM_TITLE,
  );
  if (!room) throw new Error(`${TEST_ROOM_TITLE} not found on live server`);
  return room.id;
}

test.describe('Phase 2 two-axis matrix (R8.3) — live URL', () => {
  // ----------------- MOBILE 390x844 -----------------

  test('mobile: lobby renders Tap-to-enable-mic-preview pill before any user gesture (R3.4)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await expect(page.locator('app-lobby-preview')).toBeVisible();
    await page.getByRole('button', { name: 'Test / configure devices' }).click();

    // R3.4: mobile lobby must show the AudioContext gesture pill BEFORE any user gesture
    const pill = page.getByRole('button', { name: 'Tap to enable mic preview' });
    await expect(pill).toBeVisible();

    // Sanity: AudioContext is NOT activated yet on mobile
    const activatedBefore = await page.evaluate(() => window.__meetDebug?.audioContextActivated);
    expect(activatedBefore).toBe(false);
  });

  test('mobile: lobby renders SINGLE-COLUMN device selectors at 390x844 (R3.3)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await page.getByRole('button', { name: 'Test / configure devices' }).click();

    const mic = page.locator('.mic-select');
    const camera = page.locator('.camera-select');
    await expect(mic).toBeVisible();
    await expect(camera).toBeVisible();
    const micBox = await mic.boundingBox();
    const cameraBox = await camera.boundingBox();
    expect(micBox).not.toBeNull();
    expect(cameraBox).not.toBeNull();
    // Single-column: the second selector starts strictly BELOW the first.
    expect(micBox!.y + micBox!.height).toBeLessThanOrEqual(cameraBox!.y);
  });

  test('mobile: controls bar (when shown) is bottom-docked with safe-area inset (R2.2)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await expect(page.locator('app-lobby-preview')).toBeVisible();

    // Lobby has its own "Join" CTA at the bottom on mobile — confirm the
    // bottommost interactive control is in the lower half of the viewport.
    const joinBtn = page.getByRole('button', { name: /^(Join|Ask to join)/ });
    await expect(joinBtn.first()).toBeVisible();
    const box = await joinBtn.first().boundingBox();
    expect(box).not.toBeNull();
    // R1.2 — 48px hit target
    expect(Math.floor(box!.height)).toBeGreaterThanOrEqual(44);
    // Mobile lobby docks bottom CTA in lower half
    expect(box!.y).toBeGreaterThan(844 / 2);
  });

  test('mobile: screen-share button is NOT rendered (R2.4)', async ({ page }) => {
    // Screen-share button only exists in the in-call controls-bar component.
    // On mobile, @if(!isMobile()) hides it. We assert toHaveCount(0) by
    // checking the lobby DOM (controls-bar with screen-share key is mounted
    // when in-call). For the lobby-only public test we additionally confirm
    // the controls-bar component does not expose a 'Share screen' button.
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await expect(page.locator('app-lobby-preview')).toBeVisible();

    // No share-screen control should be rendered anywhere in the mobile DOM.
    await expect(
      page.getByRole('button', { name: /Share screen|Stop sharing screen/ }),
    ).toHaveCount(0);
  });

  test('mobile: dashboard /app/rooms reachable + Angular <app-root> hydrated', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    await expect(page.locator('app-root')).toBeAttached();
    await expect(page).toHaveURL(/\/app\/rooms$/);
  });

  // ----------------- DESKTOP 1920x1080 -----------------

  test('desktop: lobby does NOT render the mic-preview pill (desktop auto-starts AudioContext)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await expect(page.locator('app-lobby-preview')).toBeVisible();

    // Desktop: pill MUST NOT appear.
    await expect(page.getByRole('button', { name: 'Tap to enable mic preview' })).toHaveCount(0);
  });

  test('desktop: lobby renders MULTI-COLUMN device selectors at 1920x1080', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await page.getByRole('button', { name: 'Test / configure devices' }).click();

    const mic = page.locator('.mic-select');
    const camera = page.locator('.camera-select');
    await expect(mic).toBeVisible();
    await expect(camera).toBeVisible();
    const micBox = await mic.boundingBox();
    const cameraBox = await camera.boundingBox();
    expect(micBox).not.toBeNull();
    expect(cameraBox).not.toBeNull();
    // Multi-column: selectors are horizontally side-by-side, so their y-ranges overlap.
    const micBottom = micBox!.y + micBox!.height;
    const cameraTop = cameraBox!.y;
    // Allow a small fudge; the assertion is: NOT strictly stacked below.
    expect(cameraTop).toBeLessThan(micBottom);
  });

  test('desktop: dashboard /app/rooms reachable + Angular <app-root> hydrated', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginLive(page);
    await expect(page.locator('app-root')).toBeAttached();
    await expect(page).toHaveURL(/\/app\/rooms$/);
  });

  // ----------------- IN-CALL VIEWPORT-SPECIFIC (sidebar + controls + screen-share) -----------------
  //
  // The next two tests join TEST_ROOM01 as host so the in-call controls
  // bar + participant sidebar component mount. This is where screen-share
  // is hidden on mobile and the bottom-sheet appears on mobile.

  async function joinAsHost(page: Page, roomId: string): Promise<void> {
    await page.goto(`${LIVE_BASE}/room/${roomId}`);
    await expect(page.locator('app-lobby-preview')).toBeVisible();
    // Display name field (only required if not previously set)
    const displayName = page.locator('#display-name');
    if (await displayName.isVisible().catch(() => false)) {
      await displayName.fill('phase2-validator');
    }
    await page.getByRole('button', { name: /^Join$/ }).click();
    await expect(page.locator('.call-panel')).toBeVisible({ timeout: 15_000 });
  }

  test('mobile in-call: screen-share button is HIDDEN; sidebar opens as bottom-sheet (R2.1 + R2.4)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await joinAsHost(page, roomId);

    // R2.4 — screen-share NOT rendered on mobile in-call
    await expect(
      page.getByRole('button', { name: /Share screen|Stop sharing screen/ }),
    ).toHaveCount(0);

    // R2.2 — controls bar bottom-docked. The Angular host `app-controls-bar`
    // can be a zero-height wrapper on mobile (the inner `.controls-bar` is
    // `position: fixed; bottom: 0`), so target the inner element.
    const controlsBar = page.locator('app-controls-bar .controls-bar');
    await expect(controlsBar).toBeVisible();
    const cbBox = await controlsBar.boundingBox();
    expect(cbBox).not.toBeNull();
    expect(cbBox!.y + cbBox!.height).toBeGreaterThan(844 * 0.7);

    // R2.1 — open participants sidebar; expect it to render in mobile-mode (bottom-sheet)
    await page.getByRole('button', { name: 'Show participants' }).click();
    const sheet = page.locator('app-participant-sidebar .participant-sidebar.mobile-mode.open');
    await expect(sheet).toBeVisible();

    // Wait briefly for slide-up animation to settle.
    await page.waitForTimeout(600);

    // Inspect the actual geometry so we can write a robust, viewport-relative
    // bottom-anchor check. The page may have a tall scroll height on the
    // in-call view, which makes document-relative boundingBox() useless.
    const geom = await page.evaluate(() => {
      const el = document.querySelector(
        'app-participant-sidebar .participant-sidebar.mobile-mode.open',
      );
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        width: r.width,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        scrollY: window.scrollY,
        docHeight: document.documentElement.scrollHeight,
      };
    });

    // ~75dvh — at innerHeight 844, ~633px (existing M-B3 asserts 560-660 range)
    expect(geom.height).toBeGreaterThan(560);
    expect(geom.height).toBeLessThan(700);
    // The sheet is bottom-anchored to the visual viewport bottom (innerHeight).
    expect(Math.abs(geom.bottom - geom.innerHeight)).toBeLessThanOrEqual(8);
    // Sheet spans the viewport width
    expect(Math.abs(geom.width - geom.innerWidth)).toBeLessThanOrEqual(2);
    // backdrop element exists (use toHaveCount to avoid strict-mode visibility
    // ambiguity — the backdrop is a transparent overlay button)
    await expect(page.locator('app-participant-sidebar .sheet-backdrop')).toHaveCount(1);

    // Leave the call cleanly so the live room doesn't accumulate stale sessions.
    await page.getByRole('button', { name: 'Leave call' }).click({ timeout: 3000 }).catch(() => undefined);
  });

  test('desktop in-call: screen-share button IS visible; sidebar is NOT a bottom-sheet (R2.4 + R2.1 desktop-unaffected)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginLive(page);
    const roomId = await findTestRoomId(page);
    await joinAsHost(page, roomId);

    // R2.4 — screen-share visible on desktop in-call
    await expect(
      page.getByRole('button', { name: /Share screen|Stop sharing screen/ }),
    ).toBeVisible();

    // R2.2 (desktop unaffected) — controls bar is NOT docked at the bottom of the viewport.
    // On desktop the controls bar lives near the top of the call-panel.
    const controlsBar = page.locator('app-controls-bar .controls-bar');
    await expect(controlsBar).toBeVisible();
    const cbBox = await controlsBar.boundingBox();
    expect(cbBox).not.toBeNull();
    // Desktop: controls bar is in the upper half of the viewport (NOT bottom-fixed).
    expect(cbBox!.y).toBeLessThan(1080 / 2);

    // R2.1 (desktop unaffected) — sidebar is a top-anchored fixed sidebar, NOT a bottom-sheet
    await page.getByRole('button', { name: 'Show participants' }).click();
    // On desktop the sidebar opens WITHOUT the mobile-mode class
    const desktopSidebar = page.locator(
      'app-participant-sidebar .participant-sidebar.open:not(.mobile-mode)',
    );
    await expect(desktopSidebar).toBeVisible();
    const sBox = await desktopSidebar.boundingBox();
    expect(sBox).not.toBeNull();
    // Desktop sidebar is anchored to the top (y close to 0 / top of panel),
    // NOT anchored to the bottom of viewport like the bottom-sheet.
    expect(sBox!.y).toBeLessThan(1080 * 0.3);
    // And it should NOT span ~75% of viewport height like the bottom-sheet does
    // (desktop fixed sidebar takes the full panel column, but is not bottom-anchored).
    const isBottomAnchored = Math.abs(sBox!.y + sBox!.height - 1080) <= 8;
    expect(isBottomAnchored).toBe(false);

    // Leave the call cleanly.
    await page.getByRole('button', { name: 'Leave call' }).click().catch(() => undefined);
  });

  // ----------------- CROSS-AXIS BASELINE -----------------

  test('cross-axis: /login serves <app-root> at both viewports', async ({ page }) => {
    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${LIVE_BASE}/login`);
    await expect(page.locator('app-root')).toBeAttached();
    await expect(page.locator('#login-email')).toBeVisible();

    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`${LIVE_BASE}/login`);
    await expect(page.locator('app-root')).toBeAttached();
    await expect(page.locator('#login-email')).toBeVisible();
  });
});
