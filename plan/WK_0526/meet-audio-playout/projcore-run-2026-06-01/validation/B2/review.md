# B2 Code Review — R2 mic-selection persistence (`resolveSelectedAudioId`)

**Reviewer:** [reviewer] v2.0 — Mode 1 (diff-level code review; no e2e yet)
**Commit under review:** `1ed70d6` (diff `be8cbb0..1ed70d6`)
**Branch:** `feat/host-audio-playout-mic-persist-20260601`

## Verdict
**APPROVE — STATUS: DONE**

Diff is surgical, in-scope, mechanism-correct, and the spec proves the regression at the exact reverting lines. No scope creep, no B1 file touched.

## Diff Summary
4 files, +240/-3:
- **NEW** `frontend/src/app/services/device-selection.ts` (+79) — pure `isGenericAudioDeviceId` + `resolveSelectedAudioId`.
- **NEW** `frontend/src/app/services/device-selection.spec.ts` (+87) — `node:assert/strict`, P1-P7.
- **EDIT** `frontend/src/app/pages/room/room.page.ts` (+9/-3) — one import line + `syncSelectedAudioIdToTrack` body rewired.
- **NEW** `…/validation/B2/changes.md` (+65) — Codex-template changes doc.

## Codex-Template Section Check (changes.md)
| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | YES | Exact quote matches brief. |
| Root Cause (mechanism) | YES | Cites `audioTrackDeviceId`→`mediaTrackDeviceId` (`:3156-3160`) returning `''`/`'default'`; `set('')` discard; `storeDevice('')` key REMOVAL (`:3128-3135`, verified `storeDevice` removes on falsy at `:3134-3137`); `refreshDevices`→`preferredDeviceId` (`:3143-3151`, verified) snap-back; option-less `[value]="selectedAudioId()"` picker. Full `''→removal→guard-fallback` chain documented. Mechanism-level, not symptom. |
| Code Changes (per-file WHAT+WHY) | YES | Three files, each WHAT + WHY. |
| Verification (build + how) | YES | `npx ng build` PASS, `npx tsx …spec.ts` PASS (8 blocks). Pre-existing warnings disclaimed. |
| Caveats | YES | Recovery sites `:2314`/`:2414` display-lag documented as OUT OF SCOPE per JROM; no-e2e-this-dispatch noted. |

## Scenario Coverage + Brief Anchoring
| Scenario (P#) | Spec block | Input→Output asserted | Brief field | OK |
|---|---|---|---|---|
| P1 chosen present + track `''` ⇒ keep chosen | block 1 | `{chosen:a,track:'',enum:[def,a,b],stored:a}`→`a` | brief branch (2) / repro of revert line | YES |
| P2 chosen present + track `'default'` ⇒ keep chosen | block 2 | `{chosen:a,track:'default',…}`→`a` | branch (2), generic no snap-back | YES |
| P3 chosen present + track DIFFERENT real ⇒ adopt | block 3 | `{chosen:a,track:b,…}`→`b` | branch (1) honest switch | YES |
| P4 chosen gone + no stored + track `'default'` ⇒ `'default'` | block 4 | `{chosen:gone,track:'default',stored:''}`→`'default'` | branch (4) unplug fallback | YES |
| P5 chosen gone + stored enumerated ⇒ restore stored | block 5 | `{chosen:gone,track:'',stored:b}`→`b` | branch (3) restore | YES |
| P6a nothing usable, devices present ⇒ `enum[0]` | block 6 | `{enum:[a,b] no 'default'}`→`a` | branch (6) `devices[0]` | YES |
| P6b nothing usable, no devices ⇒ `''` | block 7 | `{enum:[]}`→`''` | branch (6) `''` | YES |
| P7 `isGenericAudioDeviceId` classification | block 8 | `''`→t, `'default'`→t, `'communications'`→t, real→f | predicate guard | YES |

Every diff change traces to an approved brief field. No out-of-scope change present.

## Code Quality
- `resolveSelectedAudioId` branch order matches the approved 6-branch contract **exactly**:
  1. `!isGenericAudioDeviceId(trackReportedId) && enumeratedIds.includes(trackReportedId)` → adopt (concrete AND enumerated — both conditions present, correct).
  2. `chosenId && enumeratedIds.includes(chosenId)` → keep chosen. **This is THE FIX** — a generic/`''` track report can no longer reach `set('')`/`storeDevice('')`; verified branch 1 is skipped for generic ids so branch 2 wins (P1/P2).
  3. `storedId && enumeratedIds.includes(storedId)` → restore.
  4. `trackReportedId && enumeratedIds.includes(trackReportedId)` → `'default'`-style fallback.
  5/6. `'default'` if enumerated, else `enumeratedIds[0] ?? ''`.
- Branch 5/6 tail **matches `preferredDeviceId`'s tail** (`:3149-3150`: `'default'` → `devices[0] || ''`) — consistent fallback semantics, no divergence.
- Pure, framework-free (no Angular/DOM/MediaStreamTrack), mirrors `remote-audio-playability.ts` sibling. Header comment documents the WHY/mechanism inline.
- Spec imports `./device-selection.js` (matches `remote-audio-playability.spec.ts` ESM-resolution pattern), uses `node:assert/strict`, real pure-fn assertions (no `page.setContent` theatre), ends with success `console.log`. The shared `input()` helper with per-case full overrides keeps fixtures explicit.

## room.page.ts surgical check
- Import added at the service-import cluster (line 33), correct relative path `../../services/device-selection`.
- ONLY `syncSelectedAudioIdToTrack` body changed: now builds the `resolveSelectedAudioId` input from `this.selectedAudioId()`, `audioTrackDeviceId(track)`, `this.audioInputs().map(d=>d.deviceId)`, `readStoredDevice(DEVICE_STORAGE.audioInput)` — all four are pre-existing accessors (verified `readStoredDevice` `:3094`, `audioInputs` signal, `DEVICE_STORAGE.audioInput`). Then `set(next)` + `storeDevice(…, next)`.
- Sibling `syncSelectedVideoIdToTrack` immediately below is **untouched** (still unconditional) — correct, R2 is audio-only.
- Recovery call sites `:2314`/`:2414` **untouched** — matches the APPROVED out-of-scope caveat. They route through the now-fixed `syncSelectedAudioIdToTrack`, so they passively benefit from branch 2 without code change; the documented display-lag is a transient label-only edge, never a capture break.

## Convention Conformance
- TS strict build PASS per changes.md; `?? ''` nullish guard correct for empty `enumeratedIds`.
- Naming, file location (`services/`), spec naming (`.spec.ts`), and `node:assert`+`tsx` runner all match the established `remote-audio-playability` convention in this repo.

## Required Changes
None.

## Concerns (non-blocking)
- `isGenericAudioDeviceId` whitelists exactly `''`/`'default'`/`'communications'`. If a future browser emits another generic sentinel it would be treated as concrete; acceptable and matches the documented contract. No action.
- E2E (E1-E3) and manual localhost legs are not in this dispatch (correctly deferred to qa per changes.md). Mode 1 review covers code + unit spec only; full sign-off depends on the later qa e2e run.

STATUS: DONE

---

## Re-review — Iteration 2

**Reviewer:** [reviewer] v2.0 — Mode 1 (diff-level re-review of REVISE iter-2)
**Commit under review:** `63d6f94` (in context of APPROVED iter-1 `1ed70d6`)
**Trigger:** QA E2 FAIL — mic `<select>` snapped back to `default` on dialog reopen despite signal/localStorage/track all == Mic 2.

### Verdict
**APPROVE — STATUS: DONE**

The iter-2 fix is surgical, scope-correct (mic only), mechanism-level diagnosed, and correctly documents the divergence + the camera/speaker caveat. No iter-1 regression, no scope creep.

### Check results

1. **Scope of diff — PASS.** `git show 63d6f94 --name-only` touches exactly two files: `frontend/src/app/components/device-dialog/device-dialog.component.html` and the B2 `changes.md`. No other source file.

2. **Mic option binding — PASS.** `device-dialog.component.html:61-65`: the select dropped `[value]="selectedAudioId()"`; the `<option>` (`:63`) now carries `[value]="device.deviceId" [selected]="device.deviceId === selectedAudioId()"`. `(change)="onAudioChange($event)"` and `[disabled]="busy()"` both preserved on the select (`:61`). `onAudioChange` handler confirmed present (`device-dialog.component.ts:60`).

3. **CRITICAL scope check — PASS.** Camera select (`:70-74`) still uses `[value]="selectedVideoId()"` over `@for videoInputs()` with plain `<option [value]="device.deviceId">` — UNCHANGED. Speaker select (`:79-92`) still uses `[value]="selectedAudioOutputId()"` with plain `<option [value]>` — UNCHANGED. Both correctly logged as a PRE-EXISTING / OUT-OF-R2-SCOPE / DEFERRED caveat in changes.md (identical latent `[value]`-over-dynamic-options desync; same fix recommended as a follow-up). Not fixed here — correct for R2 = microphone only.

4. **Iter-1 untouched — PASS.** `git show 63d6f94 --name-only | grep room.page.ts|device-selection` returns nothing. `room.page.ts`, `device-selection.ts`, and `device-selection.spec.ts` are NOT in the iter-2 commit. The approved persistence fix is intact.

5. **changes.md quality — PASS.** "Iteration 2 (REVISE)" subsection present with: Send-back summary; mechanism-level Root Cause (Angular `[value]` is a property binding re-applied only on expression CHANGE; on reopen the `@for` options re-render and the re-created native select defaults `.value` to the first option `default`, but `selectedAudioId()` is unchanged so `[value]` is never re-set → DOM shows `default` while signal holds Mic 2; the second control using per-option `[selected]` stayed correct, confirming the divergence); code-change WHAT+WHY; confirmation evidence citing the QA test-report + screenshot; explicit "documented divergence" from the room.page.ts-only original plan; and the camera/speaker deferred caveat.

6. **Sanity — PASS, no concern.** `[selected]` on each `<option>` is re-evaluated on every change-detection cycle / option re-render, so the correct option is marked `selected` even after the list is re-created on reopen — this is precisely the native-select pattern that survives re-render, unlike the select-level `[value]`. Dropping the select's `[value]` is correct and non-conflicting: with per-option `[selected]` now authoritative, a stale select-level `[value]` would only re-apply on signal change and could fight per-option selection. No double-source-of-truth. The `(change)` handler is the write path (DOM → signal); `[selected]` is the read path (signal → DOM) — they do not conflict.

### Verification claims (changes.md, not re-run in Mode 1)
- `npx ng build`: PASS, only pre-existing unrelated warnings (NG8113 DatePipe, Stencil glob, @mediapipe). Plausible — dropping `[value]` and adding `[selected]` is valid Angular template syntax.
- `npx tsx device-selection.spec.ts`: PASS — correctly noted as unaffected by the template-only change.

### Notes
- Full sign-off still depends on the qa e2e re-verify of E2 (reopen leg) against the deployed build; Mode 1 covers diff + mechanism only.
- The camera/speaker deferred caveat is a legitimate latent bug surfaced honestly — recommend it become a tracked follow-up issue (not a blocker for B2/R2).

STATUS: DONE

---

## Test Report Verification — Iteration 2

**Reviewer:** [reviewer] — Mode 2 (Test Report Verification)
**Verified against:** HEAD `63d6f94` (iter-2 reopen-desync fix)
**Report:** `validation/B2/test-report.md` — Verdict: PASS (re-verify iter-2)

### 1. Screenshots (real, non-trivial, current)
`ls -la` + `file` on the screenshots dir — all three are real PNGs, all written `Jun 2 01:44` (regenerated this iter-2 run, not stale):

| File | Size | `file` |
|------|------|--------|
| E1-mic2-selected.png | 82,001 B | PNG 1280×1195 8-bit RGB |
| E2-reopen-mic2.png | 82,513 B | PNG 1280×1195 8-bit RGB |
| E3-reload-mic2.png | 83,142 B | PNG 1280×1195 8-bit RGB |

I opened **E2-reopen-mic2.png** directly: after the in-session collapse + reopen it shows **both** the compact preview Microphone dropdown AND the dialog `.mic-select` ("PRE-JOIN DEVICE CHECK" card) reading **"Fake Audio Input 1"** (Mic 2) — in sync, no revert to "Default". This is exactly the previously-failing reopen surface, now visually proven. The E2 screenshot is current and not stale. **PASS.**

### 2. Coverage (E1/E2/E3 + unit P1-P7)
- E1, E2, E3 each have a test-case row in both the Scenario→Test map and the Playwright-detail table, each with a result. **E2 (the iter-1 FAIL reopen leg) is now PASS** (picker == mic2, stored == mic2), attributed to commit `63d6f94`.
- Unit P1-P7 referenced as run-green. I re-ran `npx tsx frontend/src/app/services/device-selection.spec.ts` → `device-selection: all assertions passed`; grep confirms all of P1, P2, P3, P4, P5, P6a, P6b, P7 are present as `assert.strictEqual` cases. **PASS.**

### 3. Evidence quality (anti-theatre)
Opened `e2e/tests/b2-mic-persist/mic-persist.spec.ts`:
- Real browser actions: `page.goto('/join/:id?manualDeviceSetup=1')`, `dismissPermissionPrep` clicks Continue, `micSelect.selectOption(mic2)`, in-session reopen via "Hide device test" / "Test / configure devices" buttons (`reopenLobbyDialogInSession`), and `page.reload()` for E3. No `page.setContent`, no static HTML, no source-regex-dressed-as-test.
- Asserts **both** surfaces: `stored(page)` reads `localStorage['meet-poc.device.audioInput']` AND `micValue(page)` = `micSelect.inputValue()` (the live DOM `<select>` value).
- **E2 checks the picker DOM value == mic2 after reopen** — `expect.soft(e2PickerValue, ...).toBe(mic2)` where `e2PickerValue = await micValue(page)` after `reopenLobbyDialogInSession`. This asserts the actual bug surface (DOM select value on reopen), not just localStorage. The reopen path genuinely re-runs `refreshDevices`/`syncSelectedAudioIdToTrack` and re-renders `.mic-select`. **PASS.**
- Template-fix corroboration: `device-dialog.component.html:61-63` — mic `<select>` no longer carries select-level `[value]`; each `<option>` now has `[selected]="device.deviceId === selectedAudioId()"`. Matches the report's described iter-2 fix exactly. (Camera/speaker selects keep their `[value]` — out of B2 scope, untouched.)

### 4. Honesty of E3 harness-limited claim
The report states plainly (Summary + Verdict + Playwright table row 3 + Reproduce-before-verify) that the fake-device deviceId hash **regenerates per page load** (LOAD1 ids != LOAD2 ids), so the persisted concrete id is not enumerated after `page.reload()` and the picker legitimately falls back (AC R2.3) — localStorage durability **is** proven, picker-restore is harness-limited. The spec backs this with the `[E3 HARNESS-LIMITED]` console branch (`if (e3ReloadIds.includes(mic2)) {assert} else {log}`) — i.e. it still HARD-asserts restore IF mic2 is enumerated, only logging when the harness regenerated the hash. Restore proof is correctly pointed to unit **P5** (chosen-gone + stored-enumerated ⇒ restore stored) and manual **M2**. This is an honestly surfaced harness limitation, **NOT a fail**.

### 5. Verdict consistency
Report verdict "PASS (re-verify iter-2)" is consistent with the evidence: E1 PASS, E2 reopen now PASS (DOM picker == Mic 2, screenshot-confirmed), E3 localStorage durable + picker-restore honestly harness-limited, unit P1-P7 green. The iter-1 desync mechanism is correctly characterized (select-level `[value]` not re-applying on option re-render) and the per-option `[selected]` fix matches the served template. No theatre detected.

### Verification verdict
**VERIFIED.** Real Playwright evidence, all three scenarios covered with screenshots, E2 (prior FAIL) now genuinely passes at both the localStorage and DOM-picker level, unit suite green, and the E3 limitation is honestly disclosed (not masked as a pass).

STATUS: DONE (VERIFIED)
