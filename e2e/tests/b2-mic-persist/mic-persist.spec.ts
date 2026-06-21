import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { cleanupRoomsByPrefix } from '../../fixtures/db';
import { loginAsJrom } from '../../fixtures/auth';
import { createRoomViaApi, type TestRoom } from '../../fixtures/rooms';

// B2 — R2 microphone-selection persistence.
//
// The fix (B2 / commit 1ed70d6): `syncSelectedAudioIdToTrack` no longer adopts the
// live track's reported deviceId UNCONDITIONALLY. It now routes through the pure
// `resolveSelectedAudioId(...)` decision (frontend/src/app/services/device-selection.ts):
// a still-present concrete user choice is NOT downgraded to a generic/'' track report,
// and `storeDevice` persists the RESOLVED concrete id rather than '' (which used to
// delete the key and let `refreshDevices` snap the picker to 'default'/first-device).
//
// HARNESS / HONESTY NOTE (mirrors the scenarios.md "Fake-device caveat"): under
// `--use-fake-device-for-media-stream` the fake mics round-trip their deviceId
// FAITHFULLY through getSettings().deviceId — so the harness cannot reproduce the
// REAL-hardware aliasing (a concrete pick whose track reports '' / 'default') that
// triggered the original snap-back. The deterministic regression proof for the exact
// reverting lines is therefore the unit spec
// `frontend/src/app/services/device-selection.spec.ts` cases P1/P2 (run via
// `npx tsx ...`): chosen-present + generic ('' / 'default') track report ⇒ keep chosen.
// These E2E cases prove the user-facing outcome end-to-end through the real Angular
// component + room.page wiring: select a non-'default' mic ⇒ it sticks in the picker
// and the concrete id persists across reopen and reload (no snap to 'default').

const B2_PREFIX = 'B2MICPERSIST';
const STORAGE_KEY = 'meet-poc.device.audioInput';

const SHOTS_DIR =
  process.env.B2_SHOTS_DIR ||
  path.resolve(
    process.cwd(),
    '..',
    'plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/validation/B2/screenshots',
  );

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`), fullPage: true });
}

const micSelect = (page: Page) => page.locator('app-device-dialog .mic-select');
const micValue = (page: Page) => micSelect(page).inputValue();
const stored = (page: Page) =>
  page.evaluate((key) => window.localStorage.getItem(key) || '', STORAGE_KEY);
const optionIds = (page: Page) =>
  micSelect(page)
    .locator('option')
    .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));

test.beforeAll(() => {
  cleanupRoomsByPrefix(B2_PREFIX); // never touches TEST_ROOM01 (different prefix)
});

test.afterAll(() => {
  cleanupRoomsByPrefix(B2_PREFIX);
});

/**
 * Open the lobby device dialog with devices enumerated.
 * `/join/:slug` loads the RoomPage (room lobby). With `manualDeviceSetup=1` the
 * inline app-device-dialog opens on the permission-prep card; clicking Continue
 * emits `continuePermission`, which enumerates devices and renders the populated
 * `.mic-select` (3 fake audio inputs: 'default' + two real-hash mics).
 */
async function dismissPermissionPrep(page: Page): Promise<void> {
  // The permission-prep card gates the device-grid. Clear it (then it detaches and
  // the dialog enumerates devices). Idempotent: a return visit may not show it.
  const prep = page.getByTestId('permission-prep');
  if (await prep.count()) {
    await prep.getByRole('button', { name: 'Continue' }).click();
    await expect(prep).toHaveCount(0, { timeout: 8000 });
  }
}

async function openLobbyDialogWithDevices(page: Page, roomToJoin: TestRoom): Promise<void> {
  await page.goto(`/join/${roomToJoin.id}?manualDeviceSetup=1`);
  // Wait for the inline lobby dialog to mount before touching the permission card.
  await expect(page.locator('app-device-dialog')).toBeVisible({ timeout: 10_000 });
  await dismissPermissionPrep(page);
  await expect(micSelect(page)).toBeVisible({ timeout: 8000 });
  // Devices enumerated ⇒ the picker has its real options (not the empty pre-perm select).
  await expect.poll(() => optionIds(page).then((ids) => ids.length), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
}

/**
 * Reopen the lobby device dialog IN-SESSION (no page navigation) via the
 * Hide-device-test / Test-configure-devices toggle. This is the faithful reopen:
 * `toggleLobbyDeviceDialog()` re-runs `refreshDevices()` → `syncSelectedAudioIdToTrack`
 * (the exact path the old code snapped back in), and the fake-device deviceId hash is
 * STABLE within a single page session (it is NOT stable across page loads — see the
 * E3 harness note), so the picker can honestly be asserted to still show Mic 2.
 */
async function reopenLobbyDialogInSession(page: Page): Promise<void> {
  // Collapse, then re-expand. Whichever label is present, click to close first.
  const hide = page.getByRole('button', { name: 'Hide device test' });
  if (await hide.count()) await hide.first().click();
  await expect(page.locator('app-device-dialog')).toHaveCount(0, { timeout: 8000 });
  await page.getByRole('button', { name: 'Test / configure devices' }).click();
  await expect(page.locator('app-device-dialog')).toBeVisible({ timeout: 8000 });
  await dismissPermissionPrep(page);
  await expect(micSelect(page)).toBeVisible({ timeout: 8000 });
  await expect.poll(() => optionIds(page).then((ids) => ids.length), { timeout: 8000 }).toBeGreaterThanOrEqual(3);
}

// E1→E2→E3 run as ordered steps on ONE page/context: persistence (the localStorage
// audioInput key + the logged-in session) is precisely what R2 must preserve, so a
// fresh per-test context would wipe the state under test. Each step maps 1:1 to a
// scenario and asserts its own acceptance criterion.
test('E1-E3: select Mic 2 ⇒ persists through reopen + reload (no snap-back)', async ({ page, request }) => {
  test.setTimeout(90_000);
  const room: TestRoom = await createRoomViaApi(request, `${B2_PREFIX} select ${Date.now()}`);
  await loginAsJrom(page);

  let mic2 = '';

  await test.step('E1: select Mic 2 ⇒ picker keeps Mic 2, no snap-back, persisted', async () => {
    await openLobbyDialogWithDevices(page, room);

    // Three enumerated audio inputs ('default' + two real-hash fake mics).
    const ids = await optionIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    mic2 = ids[1]; // a non-'default' real-hash entry
    expect(mic2).not.toBe('default');
    expect(mic2).not.toBe('');

    await micSelect(page).selectOption(mic2);

    // No snap-back: poll absorbs any async syncSelectedAudioIdToTrack settle (this is
    // exactly where the old code reverted to 'default').
    await expect.poll(() => micValue(page), { timeout: 8000 }).toBe(mic2);
    expect(await optionIds(page)).toContain(mic2);

    // storeDevice kept the concrete id (not '').
    await expect.poll(() => stored(page), { timeout: 8000 }).toBe(mic2);

    await shot(page, 'E1-mic2-selected');
  });

  // Observed outcomes recorded non-fatally so ALL three scenarios produce evidence
  // (screenshots + state) in one run; the verdict is asserted at the end.
  let e2PickerValue = '';
  let e2Stored = '';
  let e3Stored = '';
  let e3PickerValue = '';
  let e3ReloadIds: string[] = [];

  await test.step('E2: reopen picker ⇒ still Mic 2', async () => {
    // Reopen in-session (collapse + re-expand) — re-renders .mic-select and re-runs
    // refreshDevices/syncSelectedAudioIdToTrack, with the fake deviceId hash STABLE
    // within the session (so mic2 is still enumerated — a faithful reopen test).
    await reopenLobbyDialogInSession(page);
    // Settle any async sync after the dialog re-acquires media.
    await page.waitForTimeout(2500);
    e2PickerValue = await micValue(page);
    e2Stored = await stored(page);
    await shot(page, 'E2-reopen-mic2');
  });

  await test.step('E3: page reload ⇒ still Mic 2 (subject to device still enumerated)', async () => {
    await page.goto(`/join/${room.id}`);
    await page.reload();
    e3Stored = await stored(page); // localStorage durability across the reload

    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.count()) await cont.first().click();
    if (!(await page.locator('app-device-dialog').count())) {
      const configure = page.getByRole('button', { name: 'Test / configure devices' });
      if (await configure.count()) await configure.first().click();
    }
    if (await page.locator('app-device-dialog').count()) {
      await dismissPermissionPrep(page).catch(() => undefined);
    }
    await page.waitForTimeout(2000);
    e3ReloadIds = (await micSelect(page).count()) ? await optionIds(page) : [];
    e3PickerValue = (await micSelect(page).count()) ? await micValue(page).catch(() => '') : '';
    await shot(page, 'E3-reload-mic2');
  });

  // ---------- Verdict ----------
  // E2 is the load-bearing reopen assertion. The fake deviceId hash is STABLE within
  // this session, so mic2 is still enumerated and storage holds mic2 — the picker MUST
  // still show mic2. If it reverts to 'default' that is a real reopen-path snap-back.
  expect.soft(e2Stored, 'E2 localStorage must still hold Mic 2 (storage durable across reopen)').toBe(mic2);
  expect.soft(e2PickerValue, 'E2 picker must still show Mic 2 after in-session reopen (no snap-back)').toBe(mic2);

  // E3 reload: localStorage durability is hard. The picker-restore is subject to the
  // device still being enumerated — under the fake harness the hash is regenerated on
  // reload (verified LOAD1!=LOAD2), so mic2 may be absent; in that case picker-restore
  // is harness-limited (deterministic proof = unit P5 + manual M2). If mic2 IS still
  // enumerated, the picker MUST restore to it.
  expect.soft(e3Stored, 'E3 localStorage must survive the page reload').toBe(mic2);
  if (e3ReloadIds.includes(mic2)) {
    expect.soft(e3PickerValue, 'E3 picker must restore Mic 2 when it is still enumerated').toBe(mic2);
  } else {
    console.log(
      `[E3 HARNESS-LIMITED] fake-device hash regenerated across reload; persisted mic2=${mic2} ` +
        `not in reload ids=${JSON.stringify(e3ReloadIds)}. localStorage persisted (stored===mic2). ` +
        `Picker shows '${e3PickerValue}' (legit AC R2.3 fallback). Reload-restore proof = unit P5 + manual M2.`,
    );
  }
});
