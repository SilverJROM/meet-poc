# Test Report: Batch B2 — R2 microphone-selection persistence

## Tested Against
- **Isolated harness URL:** `http://localhost:4730` (consolidated proxy; backend 4740, Angular 4731)
- **Isolated DB:** `MEET_DB_PATH=data/e2e-b2/meet-poc.sqlite` (seeded fresh; deleted after run). Live `data/meet-poc.sqlite` NOT touched.
- **Browser:** Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` (3 audio inputs: `default` + two real-hash fake mics).

## Branch / Commit
- Branch: `feat/host-audio-playout-mic-persist-20260601`
- HEAD (re-verify iter-2): `63d6f94` — *[batch-2] fix mic-select reopen desync — [selected] per-option binding (R2 reopen snap-back) | scenarios: E2*
- Original run HEAD: `1ed70d6` — *[batch-2] resolveSelectedAudioId pure fn + rewire syncSelectedAudioIdToTrack (R2 mic persistence) | scenarios: P1-P7*

## Re-verify (iter-2) — E2 reopen snap-back fix

**Fix under test (commit `63d6f94`):** `device-dialog.component.html` mic `<select>` dropped the
select-level `[value]="selectedAudioId()"` and each `<option>` now carries
`[selected]="device.deviceId === selectedAudioId()"`. This re-marks the correct option as selected
after the dialog reopens / options re-render — the prior iter-1 FAIL was a DOM-value desync where the
`.mic-select` reverted to `default` on reopen even though signal + localStorage + capture track all held Mic 2.

**Served-bundle confirmation:** the e2e harness serves the FE via the playwright `webServer`
(`scripts/e2e-webserver.js` → `npm run start -w frontend` = `ng serve`), which compiles from source —
so the template fix is served live, no prebuilt bundle / `ng build` required. Confirmation that the fixed
bundle was actually served: the E2 outcome **changed vs iter-1** — the `.mic-select` now shows Mic 2
("Fake Audio Input 1") on reopen (screenshot `E2-reopen-mic2.png`, regenerated), where iter-1 showed
`default`. The two soft E2 assertions (`e2Stored === mic2` and `e2PickerValue === mic2`) both passed
(test exit code 0, `1 passed`).

**Exact command run (re-verify iter-2, from repo root):**
```
MEET_DB_PATH="$(pwd)/data/e2e-b2/meet-poc.sqlite" \
MEET_RECORDINGS_DIR="$(pwd)/data/e2e-b2/recordings" \
E2E_BACKEND_PORT=4740 E2E_FRONTEND_PORT=4731 E2E_PROXY_PORT=4730 \
E2E_BASE_URL="http://localhost:4730" E2E_WS_ORIGIN="ws://localhost:4730" \
B2_SHOTS_DIR="$(pwd)/plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/validation/B2/screenshots" \
npm test -w e2e -- e2e/tests/b2-mic-persist/ --config=playwright.config.ts --workers=1
```
Result: `1 passed (13.5s)`. E1 PASS, E2 (reopen) now **PASS**, E3 localStorage durable + picker-restore
harness-limited (fake deviceId hash regenerated across reload — verified in the `[E3 HARNESS-LIMITED]`
console line: persisted `mic2` not present in the reloaded option ids). Isolated DB `data/e2e-b2/` and
`e2e/test-results/b2-*` removed after run; live `data/meet-poc.sqlite` has 0 `B2MICPERSIST*` rooms;
`TEST_ROOM01` (`testroom01001`) untouched.

## Exact commands used
```
# Unit (deterministic decision-function proof, P1-P7):
npx tsx frontend/src/app/services/device-selection.spec.ts

# E2E (isolated DB + isolated ports), from repo root:
MEET_DB_PATH="$(pwd)/data/e2e-b2/meet-poc.sqlite" \
MEET_RECORDINGS_DIR="$(pwd)/data/e2e-b2/recordings" \
E2E_BACKEND_PORT=4740 E2E_FRONTEND_PORT=4731 E2E_PROXY_PORT=4730 \
E2E_BASE_URL="http://localhost:4730" E2E_WS_ORIGIN="ws://localhost:4730" \
B2_SHOTS_DIR="$(pwd)/plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01/validation/B2/screenshots" \
npm test -w e2e -- e2e/tests/b2-mic-persist/ --config=playwright.config.ts --workers=1
```

## Scenario → Test mapping

| Scenario | Test / step | Selector / Key | Acceptance | Result |
|----------|-------------|----------------|------------|--------|
| E1 | `E1: select Mic 2 ⇒ picker keeps Mic 2, no snap-back, persisted` (`test.step`) | `app-device-dialog .mic-select` `inputValue()`; `localStorage['meet-poc.device.audioInput']` | R2.1 | **PASS** |
| E2 | `E2: reopen picker ⇒ still Mic 2` (`test.step`, in-session collapse+reopen) | same selector | R2.2 (reopen) | **PASS** (iter-2, commit 63d6f94) |
| E3 | `E3: page reload ⇒ still Mic 2` (`test.step`, `page.reload()`) | same selector + storage | R2.2 (reload) | localStorage **PASS**; picker-restore **HARNESS-LIMITED** |
| P1-P7 | `frontend/src/app/services/device-selection.spec.ts` (node:assert/strict) | pure `resolveSelectedAudioId` / `isGenericAudioDeviceId` | R2.1 / R2.2 / R2.3 | **PASS (all)** |

## Playwright Tests detail

| # | Scenario step | Action | Expected | Actual | Screenshot | Result |
|---|---------------|--------|----------|--------|-----------|--------|
| 1 | E1 | Open lobby dialog (`/join/<id>?manualDeviceSetup=1` → Continue), select `optionIds()[1]` (non-`default` real-hash) | picker `inputValue()` == mic2; option list contains mic2; `localStorage` key == mic2 | picker == mic2; list contains mic2; stored == mic2 | `screenshots/E1-mic2-selected.png` | **PASS** |
| 2 | E2 | Collapse (`Hide device test`) + re-expand (`Test / configure devices`); settle 2.5 s; read picker + storage | picker == mic2; stored == mic2 | **picker == mic2** ("Fake Audio Input 1", no revert — iter-2 fix); stored == mic2 (durable) | `screenshots/E2-reopen-mic2.png` | **PASS** (iter-2, commit 63d6f94) |
| 3 | E3 | `page.reload()`; reopen dialog; read storage, enumerated ids, picker | stored survives; picker restores mic2 IF mic2 still enumerated | stored == mic2 (PASS); mic2 NOT in reload ids (fake-hash regenerated) ⇒ picker `default` = legit AC R2.3 fallback | `screenshots/E3-reload-mic2.png` | storage PASS; restore HARNESS-LIMITED |

## Reproduce-before-verify

- **Unit (deterministic, the real regression proof):** `device-selection.spec.ts` P1-P7 all pass on HEAD. P1/P2 are the exact pre-fix repro: chosen-present + generic track report (`''` / `'default'`) ⇒ the fix returns the kept `chosenId` (pre-fix `syncSelectedAudioIdToTrack` did `set(actualDeviceId='')` / `storeDevice('')`). Confirmed the pre-fix function at `be8cbb0:room.page.ts:2143` was the unconditional `this.selectedAudioId.set(audioTrackDeviceId(track))` overwrite; `device-selection.ts` did not exist pre-B2.
- **Fake-device harness limitation (honest):** under `--use-fake-device-for-media-stream` the fake mic faithfully reports the chosen concrete deviceId on its track (verified: after selecting Mic 2, the live track's `getSettings().deviceId` == mic2). So the harness **cannot reproduce the real-hardware aliasing** (concrete pick whose track reports `''`/`'default'`) that the fix targets — pre-fix code would also "pass" E1 here. The deterministic proof of the reverting lines is therefore unit P1/P2, not E1.
- **Fake-device hash instability (verified):** the fake mic deviceId hash is regenerated on every page load (LOAD1 ids != LOAD2 ids). So across a `page.reload()` the persisted concrete id is no longer enumerated and the picker legitimately falls back (AC R2.3). Real hardware keeps a stable id, so M2 (manual localhost) is the real reload-restore proof; unit P5 is the deterministic restore-decision proof.

## E2 finding (mechanism) — RESOLVED in iter-2

**iter-1 (commit 1ed70d6) — FAIL:** the spec-specified picker `app-device-dialog .mic-select` (then bound
`[value]="selectedAudioId()"` at the select level) **reverted to `default` on reopen**, even though the live
capture track stayed on Mic 2, Mic 2 was still enumerated (stable hash within the session), and
`localStorage['meet-poc.device.audioInput']` still held Mic 2. Because every `resolveSelectedAudioId(...)`
input pointed to mic2, the snap-back was NOT in the B2-rewired `syncSelectedAudioIdToTrack` — it was a
**DOM-value desync**: the select-level `[value]` binding did not re-apply after the options re-rendered on
reopen, so the `<select>` fell back to its first/`default` option while the signal still held mic2 (the
compact preview dropdown, which renders differently, kept Mic 2 — the two controls were out of sync).

**iter-2 fix (commit 63d6f94) — RESOLVED:** dropped the select-level `[value]` and moved selection to a
per-option `[selected]="device.deviceId === selectedAudioId()"`. Now, whenever the options re-render on
reopen, the correct option re-marks itself selected from the signal — eliminating the desync. Re-verify
confirms the `.mic-select` shows Mic 2 ("Fake Audio Input 1") after the in-session collapse+reopen, both
soft assertions pass, and the regenerated screenshot `E2-reopen-mic2.png` shows the dialog `.mic-select`
AND the compact preview both on "Fake Audio Input 1" (in sync). R2.2 (reopen leg) now PASSES end-to-end.

## Summary (re-verify iter-2, commit 63d6f94)
- E2E: 1 spec, 1 ordered test (3 steps), `1 passed (13.5s)`. **E1 PASS, E2 PASS (picker now shows Mic 2 on reopen — iter-1 desync fixed), E3 storage PASS / picker-restore harness-limited (as-expected).**
- Unit: P1-P7 all PASS in the original run (`device-selection: all assertions passed`) — the pure decision contract was always green; iter-2 touched only the template, no unit change.
- Screenshots (regenerated this run): 3 (`E1-mic2-selected.png`, `E2-reopen-mic2.png` — now shows "Fake Audio Input 1" / Mic 2, `E3-reload-mic2.png`).
- E3 console: `[E3 HARNESS-LIMITED]` line confirms the fake deviceId hash regenerated across reload (persisted `mic2` absent from reload option ids) ⇒ picker `default` is the legit AC R2.3 fallback; localStorage held `mic2`. Reload-restore deterministic proof = unit P5 + manual M2. (Same OverconstrainedError harness artifact as before, not asserted against.)
- Isolation: live `data/meet-poc.sqlite` has 0 `B2MICPERSIST*` rooms; `TEST_ROOM01` (`testroom01001`) untouched; isolated `data/e2e-b2/` removed after run; `e2e/test-results/b2-*` removed.

## Verdict: PASS (re-verify iter-2)

E1 (select, no snap-back at selection, persisted) PASSES, E2 (reopen) now **PASSES** — the iter-2 per-option
`[selected]` binding (commit 63d6f94) fixes the DOM-value desync that made iter-1's `.mic-select` revert to
`default`; the picker now holds Mic 2 across the in-session reopen, with storage + capture track + enumeration
all consistent (screenshot-backed). E3 reload localStorage durability PASSES; E3 picker-restore is
harness-limited (fake deviceId hash regenerates per page load — a harness artifact, NOT a regression), with the
deterministic restore proof carried by unit P5 and the manual localhost leg M2. The deterministic unit suite
P1-P7 proves the `resolveSelectedAudioId` decision contract. Real reopen/reload on stable hardware = manual M1-M3.

STATUS: DONE (PASS) — E1 + E2 (reopen) pass on commit 63d6f94; E2 picker now shows Mic 2 on reopen (iter-1 desync resolved, screenshot E2-reopen-mic2.png); E3 localStorage durable, picker-restore harness-limited (fake deviceId hash regenerates per load — harness artifact, not a regression); unit P1-P7 pass.
