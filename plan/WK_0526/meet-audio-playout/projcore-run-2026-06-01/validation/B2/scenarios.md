# B2 Scenarios — Microphone selection persistence

**Batch:** B2
**Branch:** `feat/host-audio-playout-mic-persist-20260601`
**Requirement:** R2 ONLY (R1 host-audio-playout is B1 — out of scope here)
**Mode:** Mode 1 (scenarios authored before dev codes)

## Context (verified in code, HEAD be8cbb0)

- The mic `<select>` is **option-less / fully bound**: `device-dialog.component.html:61` renders
  `<select class="device-select mic-select" [value]="selectedAudioId()" ...>` with `@for` options over
  `audioInputs()`. There is no template `[selected]`; the rendered value is exactly `selectedAudioId()`.
  ⇒ Whenever `selectedAudioId()` is set to a value that is **not** in `audioInputs()`, or to a *different*
  enumerated entry than the user picked, the picker visibly snaps to that entry.
- **The revert mechanism (`syncSelectedAudioIdToTrack`, `room.page.ts:2143-2147`):**
  ```
  private syncSelectedAudioIdToTrack(track) {
    const actualDeviceId = audioTrackDeviceId(track);   // == mediaTrackDeviceId(track), :3147/:3156
    this.selectedAudioId.set(actualDeviceId);           // UNCONDITIONAL overwrite
    storeDevice(DEVICE_STORAGE.audioInput, actualDeviceId); // '' ⇒ REMOVES the stored key (:3128-3135)
  }
  ```
  `mediaTrackDeviceId` returns `track.getSettings().deviceId` or `''` when absent (`:3156-3160`). On several
  browsers/track shapes `getSettings().deviceId` is `''` or a generic `'default'` even though the user chose a
  concrete enumerated mic. The unconditional `set('')` discards the choice **and** `storeDevice('')` deletes
  the persisted key.
- **The fallback guard (`refreshDevices`, `room.page.ts:1955-1957`):** after the choice is wiped to `''`,
  `!this.selectedAudioId()` is true ⇒ it re-derives via `preferredDeviceId(...)` (`:3137-3145`), which prefers
  the stored key (now gone) → `'default'` if present → `devices[0]`. Net effect: the user's concrete pick is
  replaced by `'default'`/first-device — the reported "not persisting" snap-back.
- **Legitimate behavior to preserve (AC R2.3):** when the chosen device is genuinely *gone* (unplugged, no
  longer enumerated), falling back to another enumerated mic is correct and must not regress.

## Approved fix surface (what scenarios assert against)

A new pure module is extracted at `frontend/src/app/services/device-selection.ts` (sibling spec
`device-selection.spec.ts`, mirroring `remote-audio-playability.spec.ts` `node:assert/strict` + `npx tsx` style):

```ts
isGenericAudioDeviceId(id: string): boolean
// true for the non-concrete ids the track may report: '' and 'default' (and 'communications').

resolveSelectedAudioId(input: {
  chosenId: string;          // what the user last selected (current selectedAudioId before sync)
  trackReportedId: string;   // mediaTrackDeviceId(track) of the live capture track ('' / 'default' / a real hash)
  enumeratedIds: string[];   // device ids currently in audioInputs()
  storedId: string;          // readStoredDevice(DEVICE_STORAGE.audioInput) ('' if none)
}): string                   // the deviceId selectedAudioId should be set to
```

**Rule (the decision contract under test) — first matching branch wins:**

1. **Adopt track id** — if `trackReportedId` is concrete (`!isGenericAudioDeviceId`) **and** enumerated
   (`enumeratedIds.includes(trackReportedId)`) ⇒ return `trackReportedId`.
   (Capture genuinely switched to a different concrete mic; reflect reality.)
2. **Keep chosen** — else if `chosenId` is still enumerated ⇒ return `chosenId`.
   (The user's pick is still present; a generic/'' track report must NOT discard it.)
3. **Restore stored** — else if `storedId` is still enumerated ⇒ return `storedId`.
4. **Track 'default' fallback** — else if `trackReportedId` is enumerated (e.g. `'default'`) ⇒ return `trackReportedId`.
5. **Last resort** — else return `'default'` if enumerated, else `enumeratedIds[0]`, else `''`.

`syncSelectedAudioIdToTrack` is rewired to call `resolveSelectedAudioId(...)`, set `selectedAudioId` to the
result, and `storeDevice` the **resolved** id (so a concrete kept/restored choice persists; only a genuinely
empty result clears the key).

---

## Unit scenarios (pure decision function) — HARD

These mirror the `node:assert/strict` block style of `remote-audio-playability.spec.ts`, run via
`npx tsx frontend/src/app/services/device-selection.spec.ts`. Every case is a pure-function
input→exact-string assertion (no DOM, no browser). Fixture device ids below:

- `MIC1 = 'default'` (generic), `MIC2 = 'aaaa1111realhash'`, `MIC3 = 'bbbb2222realhash'`
- `enumerated = ['default', 'aaaa1111realhash', 'bbbb2222realhash']` unless a case states otherwise.

### P1 — chosen present + track reports `''` ⇒ keep chosen — **HARD**
- **Acceptance:** Input: `{ chosenId: 'aaaa1111realhash', trackReportedId: '', enumeratedIds: ['default','aaaa1111realhash','bbbb2222realhash'], storedId: 'aaaa1111realhash' }` → Output: `'aaaa1111realhash'`.
- **Assertion:** `assert.strictEqual(resolveSelectedAudioId(input), 'aaaa1111realhash')`.
- **Proves:** the empty-string track report (the primary repro) does NOT discard the user's still-present choice (branch 2 beats the old unconditional `set('')`). Regression-proof for the reverting line.

### P2 — chosen present + track reports `'default'` ⇒ keep chosen — **HARD**
- **Acceptance:** Input: `{ chosenId: 'aaaa1111realhash', trackReportedId: 'default', enumeratedIds: ['default','aaaa1111realhash','bbbb2222realhash'], storedId: 'aaaa1111realhash' }` → Output: `'aaaa1111realhash'`.
- **Assertion:** `assert.strictEqual(resolveSelectedAudioId(input), 'aaaa1111realhash')`.
- **Proves:** a generic `'default'` track report (also `isGenericAudioDeviceId`) does not snap-back when the concrete pick is still enumerated (branch 1 skipped because `'default'` is generic; branch 2 wins).

### P3 — chosen present + track reports DIFFERENT enumerated real id ⇒ adopt track id — **HARD**
- **Acceptance:** Input: `{ chosenId: 'aaaa1111realhash', trackReportedId: 'bbbb2222realhash', enumeratedIds: ['default','aaaa1111realhash','bbbb2222realhash'], storedId: 'aaaa1111realhash' }` → Output: `'bbbb2222realhash'`.
- **Assertion:** `assert.strictEqual(resolveSelectedAudioId(input), 'bbbb2222realhash')`.
- **Proves:** when capture genuinely moved to another *concrete enumerated* mic, the UI reflects the real device (branch 1) rather than stubbornly showing the stale `chosenId`. Distinguishes "honest track switch" from "spurious generic report".

### P4 — chosen absent (unplugged) + no stored + track `'default'` ⇒ fall back to `'default'` — **HARD**
- **Acceptance:** Input: `{ chosenId: 'cccc9999goneunplugged', trackReportedId: 'default', enumeratedIds: ['default','aaaa1111realhash','bbbb2222realhash'], storedId: '' }` → Output: `'default'`.
- **Assertion:** `assert.strictEqual(resolveSelectedAudioId(input), 'default')`.
- **Proves:** AC R2.3 — the legitimate "device unplugged → fall back" path still works. `chosenId` not enumerated (branch 2 fails), no stored (branch 3 fails), track `'default'` is enumerated (branch 4 returns it).

### P5 — chosen absent + stored still enumerated ⇒ restore stored — **HARD**
- **Acceptance:** Input: `{ chosenId: 'cccc9999goneunplugged', trackReportedId: '', enumeratedIds: ['default','aaaa1111realhash','bbbb2222realhash'], storedId: 'bbbb2222realhash' }` → Output: `'bbbb2222realhash'`.
- **Assertion:** `assert.strictEqual(resolveSelectedAudioId(input), 'bbbb2222realhash')`.
- **Proves:** persistence — when the in-memory choice is gone but a previously persisted concrete id is still present, it is restored (branch 3), not blindly defaulted. Covers the reload-restore decision (AC R2.2).

### P6 — nothing usable ⇒ `devices[0]` / `''` — **HARD**
- **Acceptance (P6a, devices present):** Input: `{ chosenId: 'gone', trackReportedId: 'alsoGone', enumeratedIds: ['aaaa1111realhash','bbbb2222realhash'], storedId: 'goneTooStored' }` → Output: `'aaaa1111realhash'` (no `'default'` present ⇒ `enumeratedIds[0]`).
- **Acceptance (P6b, no devices):** Input: `{ chosenId: 'gone', trackReportedId: '', enumeratedIds: [], storedId: '' }` → Output: `''`.
- **Assertions:** `assert.strictEqual(resolveSelectedAudioId(P6a), 'aaaa1111realhash')` and `assert.strictEqual(resolveSelectedAudioId(P6b), '')`.
- **Proves:** branch 5 last-resort — when chosen, stored and track are all unusable, fall to `'default'` if enumerated, else first device, else `''` (matches `preferredDeviceId`'s tail). P6a also proves `'default'` is NOT invented when not enumerated.

### P7 — `isGenericAudioDeviceId` classification — **HARD (helper unit)**
- **Acceptance:** `isGenericAudioDeviceId('')` → `true`; `isGenericAudioDeviceId('default')` → `true`; `isGenericAudioDeviceId('communications')` → `true`; `isGenericAudioDeviceId('aaaa1111realhash')` → `false`.
- **Assertions:** four `assert.strictEqual` on the exact booleans above.
- **Proves:** the generic-id predicate that branch 1 depends on — a real device hash is concrete; `''`/`'default'`/`'communications'` are generic. Guards P1/P2 vs P3.

---

## E2E scenarios (single host context, fake-device harness) — HARD

**Harness:** Playwright `playwright.config.ts` launches Chromium with
`--use-fake-device-for-media-stream`, exposing 3 audio inputs — `'default'` plus two real-hash fake mics.
The mic `<select>` is `app-device-dialog .mic-select`.

**Isolation (mandatory):** run with an isolated DB — `MEET_DB_PATH=data/e2e-b2/` — so the suite does NOT
pollute `data/meet-poc.sqlite`. Rooms are created with prefix `B2MICPERSIST` and torn down via
`cleanupRoomsByPrefix('B2MICPERSIST')` in `beforeAll`/`afterAll` (TEST_ROOM01 `testroom01001` /
`3f324d8be763` must remain untouched). New spec: `e2e/tests/b2-mic-persist/mic-persist.spec.ts`.
Run pattern (mirrors B1): `MEET_DB_PATH=data/e2e-b2/ npm test -w e2e -- e2e/tests/b2-mic-persist/ --config=playwright.config.ts --workers=1`.

**localStorage key under test:** `meet-poc.device.audioInput` (`DEVICE_STORAGE.audioInput`, `room.page.ts:3019`).

Helper to read the picker (reused pattern from `v3-fixc2-device-modal`):
```ts
const micSelect = page.locator('app-device-dialog .mic-select');
const micValue  = () => micSelect.inputValue();
const stored    = () => page.evaluate(() => window.localStorage.getItem('meet-poc.device.audioInput') || '');
const optionIds = () => micSelect.locator('option').evaluateAll(opts => opts.map(o => (o as HTMLOptionElement).value));
```

### E1 — SELECT Mic 2 ⇒ picker keeps Mic 2 (no snap-back) — **HARD**
- **Roles:** host (single page). No guest required (R2 is local capture/UI).
- **Precondition:** fresh room `createRoomViaApi(request, 'B2MICPERSIST select ' + Date.now())`; `loginAsJrom`; open the lobby/device dialog (`/join/<id>?manualDeviceSetup=1` → `Continue`, mirroring FIXC2.2) so `app-device-dialog` and `.mic-select` are visible with 3 options.
- **Action:**
  - `const ids = await optionIds();` — assert `ids.length >= 3` and capture `const mic2 = ids[1]` (a non-`'default'` real-hash entry: `expect(mic2).not.toBe('default'); expect(mic2).not.toBe('');`).
  - `await micSelect.selectOption(mic2);`
- **Assertions (concrete, assertable):**
  - Picker reflects the pick, no snap-back: `await expect.poll(() => micValue(), { timeout: 8000 }).toBe(mic2);` (poll absorbs the async `syncSelectedAudioIdToTrack` settle after capture switch — this is exactly where the old code snapped back).
  - Selected option still in the list: `expect(await optionIds()).toContain(mic2);`
  - Persisted to storage: `await expect.poll(() => stored(), { timeout: 8000 }).toBe(mic2);` (proves `storeDevice` kept the concrete id, not `''`).
  - Screenshot: `await page.screenshot({ path: '<B2 shots>/E1-mic2-selected.png', fullPage: true });`
- **Proves:** AC R2.1 — selecting a non-default mic applies and the picker keeps showing it (no snap-back).

### E2 — REOPEN picker ⇒ still Mic 2 — **HARD**
- **Precondition:** continue from E1 end-state (Mic 2 selected & persisted).
- **Action:** close the dialog, reopen it (lobby: re-navigate to `/join/<id>` → `Test / configure devices`; or in-call: `Device settings` gear, mirroring FIXC2.2/FIXC2.3) so `app-device-dialog .mic-select` is re-rendered.
- **Assertions:**
  - `await expect.poll(() => micValue(), { timeout: 8000 }).toBe(mic2);`
  - `expect(await stored()).toBe(mic2);` (storage unchanged by the reopen).
  - Screenshot: `<B2 shots>/E2-reopen-mic2.png`.
- **Proves:** AC R2.2 (first half) — selection survives reopening the picker.

### E3 — PAGE RELOAD ⇒ still Mic 2 — **HARD**
- **Precondition:** continue from E2 (Mic 2 selected & persisted).
- **Action:** `await page.reload();` then open the device dialog again (`Test / configure devices` / gear) so `.mic-select` re-renders from a cold page load (storage-driven via `preferredDeviceId`/restore branch).
- **Assertions:**
  - `await expect.poll(() => micValue(), { timeout: 10000 }).toBe(mic2);`
  - `expect(await stored()).toBe(mic2);`
  - Selected option present: `expect(await optionIds()).toContain(mic2);`
  - Screenshot: `<B2 shots>/E3-reload-mic2.png`.
- **Proves:** AC R2.2 (second half) — selection persists across a page reload, subject to the device still being present (the fake mic is always enumerated, so it must restore to Mic 2, never snap to `'default'`).

---

## Manual localhost note (picker UX — AC R2.4 manual leg)

Fake-device hashes are synthetic; a human should confirm the real-device feel on localhost once:

1. Run the dev frontend on localhost with at least **two real microphones** attached (or one real mic + the
   OS `'default'`). Join any room, open **Device settings**.
2. **Eyeball + screenshot:** select the *non-default* mic in the **Microphone** `.mic-select`. Confirm the
   dropdown label stays on the chosen mic and does NOT flicker/snap back to "Default" or another entry.
   Screenshot the open dialog showing the chosen mic selected → `<B2 shots>/manual-localhost-picker.png`.
3. **Reopen + reload:** close and reopen the dialog (still the chosen mic), then hard-reload the page and
   reopen (still the chosen mic). Note in the test report: chosen-mic label persisted across reopen + reload,
   and `localStorage['meet-poc.device.audioInput']` holds the concrete device id (DevTools → Application).
4. **Unplug check (don't break the good path):** with the chosen mic selected, physically unplug it (or pick
   it then disable it); confirm the picker falls back to another enumerated mic rather than going blank or
   erroring. Note the fallback target in the report.

---

## Scenario → Test mapping

### Unit spec — `frontend/src/app/services/device-selection.spec.ts` (node:assert/strict, `npx tsx`)

| Scenario | Test block (suggested) | Input → Output (exact) | Acceptance criterion | Gate |
|----------|------------------------|------------------------|----------------------|------|
| P1 | `chosen present + track '' ⇒ keep chosen` | `{chosen:'aaaa1111realhash', track:'', enum:[def,a,b], stored:'aaaa1111realhash'}` → `'aaaa1111realhash'` | R2.1 / R2.3 (repro of revert line) | HARD |
| P2 | `chosen present + track 'default' ⇒ keep chosen` | `{chosen:'aaaa1111realhash', track:'default', enum:[def,a,b], stored:'aaaa1111realhash'}` → `'aaaa1111realhash'` | R2.1 | HARD |
| P3 | `chosen present + track DIFFERENT real ⇒ adopt track` | `{chosen:'aaaa1111realhash', track:'bbbb2222realhash', enum:[def,a,b], stored:'aaaa1111realhash'}` → `'bbbb2222realhash'` | R2.1 / R2.3 (honest switch) | HARD |
| P4 | `chosen gone + no stored + track 'default' ⇒ 'default'` | `{chosen:'gone', track:'default', enum:[def,a,b], stored:''}` → `'default'` | R2.3 (unplug fallback) | HARD |
| P5 | `chosen gone + stored enumerated ⇒ restore stored` | `{chosen:'gone', track:'', enum:[def,a,b], stored:'bbbb2222realhash'}` → `'bbbb2222realhash'` | R2.2 (persistence) | HARD |
| P6a | `nothing usable, devices present ⇒ devices[0]` | `{chosen:'gone', track:'alsoGone', enum:[a,b], stored:'goneTooStored'}` → `'aaaa1111realhash'` | R2.3 (graceful) | HARD |
| P6b | `nothing usable, no devices ⇒ ''` | `{chosen:'gone', track:'', enum:[], stored:''}` → `''` | R2.3 (graceful) | HARD |
| P7 | `isGenericAudioDeviceId classification` | `''→true, 'default'→true, 'communications'→true, 'aaaa1111realhash'→false` | R2.1/R2.3 (predicate) | HARD |

### E2E — `e2e/tests/b2-mic-persist/mic-persist.spec.ts` (Playwright, fake-device, `--workers=1`, `MEET_DB_PATH=data/e2e-b2/`)

| Scenario | Test name (scenario-ID prefixed) | Key assertion | Acceptance criterion | Gate |
|----------|----------------------------------|---------------|----------------------|------|
| E1 | `test('E1: select Mic 2 ⇒ picker keeps Mic 2, no snap-back, persisted')` | `expect.poll(micValue).toBe(mic2)`; `stored()===mic2`; option list contains `mic2` | R2.1 | HARD |
| E2 | `test('E2: reopen picker ⇒ still Mic 2')` | `expect.poll(micValue).toBe(mic2)`; `stored()===mic2` | R2.2 | HARD |
| E3 | `test('E3: page reload ⇒ still Mic 2')` | after `page.reload()`: `expect.poll(micValue).toBe(mic2)`; option list contains `mic2`; `stored()===mic2` | R2.2 | HARD |

### Manual — localhost picker UX

| Item | What to eyeball / capture | Acceptance criterion |
|------|---------------------------|----------------------|
| M1 | Select non-default real mic; label sticks (no snap-back); screenshot `manual-localhost-picker.png` | R2.4 (manual leg) / R2.1 |
| M2 | Reopen + hard-reload; label persists; `localStorage['meet-poc.device.audioInput']` holds concrete id | R2.4 / R2.2 |
| M3 | Unplug chosen mic; picker falls back to another enumerated mic, no blank/error | R2.3 |

---

## Notes for the reviewer / implementer

- **Repro-first (QA Rule 3):** the regression value of P1/P2 is that they assert the *exact* state the old
  `syncSelectedAudioIdToTrack` mangled — chosen-present + generic track report ⇒ the old code did
  `set('')`/`storeDevice('')`, then `refreshDevices` snapped to `'default'`. The new fn must return the kept
  `chosenId`. If the implementer keeps the old unconditional overwrite, P1 and P2 fail.
- **Do NOT pollute the real DB:** the e2e suite MUST run with `MEET_DB_PATH=data/e2e-b2/`. Verify after the
  run that `data/meet-poc.sqlite` has no `B2MICPERSIST*` rooms; `cleanupRoomsByPrefix('B2MICPERSIST')` runs in
  `beforeAll` and `afterAll`. TEST_ROOM01 (`testroom01001` / `3f324d8be763`) is untouched.
- **Fake-device `'default'` caveat:** under `--use-fake-device-for-media-stream` the fake mics expose stable
  hashes; pick `optionIds()[1]` (a non-`'default'` real-hash entry) as "Mic 2" rather than hardcoding a hash,
  since the exact hash is harness-derived. Assert `mic2 !== 'default' && mic2 !== ''` before using it.
- **Why poll, not a bare assert, in E1:** the snap-back was *asynchronous* — capture switch → track settles →
  `syncSelectedAudioIdToTrack` fires. `expect.poll(micValue).toBe(mic2)` over ~8s catches a delayed revert
  (a bare immediate assert could pass before the buggy revert lands and give a false green).
- **Out of scope:** R1 (host audio playout) — covered in B1, no scenarios here. SFU/sender-capture/diagnostics
  per NS6 — untouched.

STATUS: DONE
