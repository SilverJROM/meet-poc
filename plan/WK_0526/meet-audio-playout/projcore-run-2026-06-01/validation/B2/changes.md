# Batch Changes — B2 Microphone selection persistence (R2)

## Branch
`feat/host-audio-playout-mic-persist-20260601` (continued from B1; B2 committed on top, no new branch, B1 files untouched)

## User Report (verbatim)
"and by the way he is trying to select a mic but its not persisting can you check that as well"

## Root Cause (mechanism-level)
`syncSelectedAudioIdToTrack` (`frontend/src/app/pages/room/room.page.ts:2143-2147`) adopted the live capture track's reported deviceId **unconditionally**:

```
const actualDeviceId = audioTrackDeviceId(track);   // == mediaTrackDeviceId(track), :3147/:3156
this.selectedAudioId.set(actualDeviceId);           // UNCONDITIONAL overwrite
storeDevice(DEVICE_STORAGE.audioInput, actualDeviceId);
```

The reverting chain:
1. `mediaTrackDeviceId` (`:3156-3160`) returns `track.getSettings().deviceId`, or `''` when absent. On several browsers/track shapes `getSettings().deviceId` is `''` or a generic `'default'` even though the user chose a concrete enumerated mic.
2. `this.selectedAudioId.set('')` discards the user's concrete pick.
3. `storeDevice(DEVICE_STORAGE.audioInput, '')` — `storeDevice` (`:3128-3135`) REMOVES the localStorage key when the value is falsy, so the persisted choice is deleted.
4. The next `refreshDevices` pass sees `!this.selectedAudioId()` true and re-derives via `preferredDeviceId(...)` (`:3137-3145`): stored key now gone → `'default'` if present → `devices[0]`. The picker (`device-dialog.component.html:61`, `[value]="selectedAudioId()"`, option-less) snaps to `'default'`/first device.

Net effect = the reported "mic selection not persisting" snap-back.

The fix replaces the unconditional adopt with a pure decision (`resolveSelectedAudioId`) that never downgrades a still-present concrete choice to a generic/empty id, while preserving the genuine "switched to a different real mic" and "chosen device unplugged → fall back" paths.

## Code Changes (per-file WHAT + WHY)

### NEW `frontend/src/app/services/device-selection.ts`
- WHAT: two pure, framework-free exported functions, styled after `remote-audio-playability.ts`:
  - `isGenericAudioDeviceId(id)` → `true` for `''`, `'default'`, `'communications'`.
  - `resolveSelectedAudioId({ chosenId, trackReportedId, enumeratedIds, storedId })` → the deviceId `selectedAudioId` should be set to, first-matching-branch wins:
    1. concrete + enumerated `trackReportedId` ⇒ adopt it (genuine switch);
    2. else `chosenId` still enumerated ⇒ keep chosen (THE FIX — generic/'' must not clobber a present choice);
    3. else `storedId` still enumerated ⇒ restore stored (reload restore);
    4. else `trackReportedId` enumerated (e.g. `'default'`) ⇒ adopt it (legit unplug fallback);
    5. else `'default'` if enumerated, else `enumeratedIds[0]`, else `''`.
- WHY: makes the persistence decision unit-provable and prevents the generic/empty track report from wiping a still-present user choice.

### NEW `frontend/src/app/services/device-selection.spec.ts`
- WHAT: `node:assert/strict` spec mirroring `remote-audio-playability.spec.ts` (imports `./device-selection.js`), implementing P1-P7 with the exact scenarios.md input→output. Runs via `npx tsx`.
- WHY: regression-locks the fix; P1/P2 assert the exact state the old code mangled.

### EDIT `frontend/src/app/pages/room/room.page.ts`
- WHAT: (a) added `import { resolveSelectedAudioId } from '../../services/device-selection';` next to the existing service imports (after the diagnostics-prefs import, line 33). (b) Rewired `syncSelectedAudioIdToTrack` ONLY to compute `next = resolveSelectedAudioId({ chosenId: this.selectedAudioId(), trackReportedId: audioTrackDeviceId(track), enumeratedIds: this.audioInputs().map(d => d.deviceId), storedId: readStoredDevice(DEVICE_STORAGE.audioInput) })`, then `this.selectedAudioId.set(next)` + `storeDevice(DEVICE_STORAGE.audioInput, next)`.
- WHY: routes the only reverting code path through the resolver; a concrete kept/restored choice now persists, and only a genuinely empty result clears the key. No other function or call site touched (recovery sites 2314/2414 and the dialog component left as-is per scope).

## Commits
- `[batch-2] resolveSelectedAudioId pure fn + rewire syncSelectedAudioIdToTrack (R2 mic persistence) | scenarios: P1-P7`
- `[batch-2] fix mic-select reopen desync — [selected] per-option binding (R2 reopen snap-back) | scenarios: E2`

## Iteration 2 (REVISE) — picker reopen snap-back (E2)

### Send-back
QA E2 FAILED: after selecting Mic 2 then collapsing+reopening the lobby device dialog, `app-device-dialog .mic-select` reverts to `default` — **even though** `localStorage['meet-poc.device.audioInput']` still == Mic 2, the live capture track stays on Mic 2, Mic 2 is still enumerated, and a *second* control on the same `selectedAudioId()` signal (the lobby compact-preview "Microphone" dropdown) correctly kept Mic 2. The iter-1 `resolveSelectedAudioId` / `syncSelectedAudioIdToTrack` rewire is correct and was KEPT untouched.

### Root Cause (mechanism-level) — this iteration
The bug is a **DOM `<select>` value desync, NOT a state reset**. Two controls bound to the same `selectedAudioId()` signal showing different values proves the signal is still Mic 2.

`device-dialog.component.html:61` used `<select ... [value]="selectedAudioId()">` over a dynamic `@for (device of audioInputs(); track device.deviceId)` option list (`:62-64`). Angular's `[value]` is a **property binding re-applied only when the bound expression CHANGES**. On dialog collapse → re-expand, the `@for` option list re-renders (options re-created); the freshly re-created native `<select>` defaults its `.value` to the first option (`default`). Because `selectedAudioId()` is UNCHANGED (still Mic 2), Angular does not re-set `.value` — so the DOM shows `default` while the signal holds Mic 2. (The compact-preview dropdown uses a per-option `[selected]` style binding, which is why it stayed correct — confirming the divergence is purely the `.mic-select` `[value]`-over-dynamic-options pitfall.)

This is the **documented divergence** from the original room.page.ts-only plan: the actual reopen-path mechanism lives in the template, not the persistence path. The iter-1 persistence fix was a real (separate) bug; this iter-2 DOM-binding fix is what the reopen scenario (R2.2 reopen leg) actually required.

### Confirmation evidence (reproduce-first)
Cited QA-captured evidence — `test-report.md` E2 row + "E2 finding (mechanism)" section + `screenshots/E2-reopen-mic2.png`: after reopen, `localStorage` == Mic 2 (durable PASS), capture track == Mic 2, Mic 2 enumerated, compact-preview dropdown == Mic 2, but `app-device-dialog .mic-select` `inputValue()` == `default`. Signal NOT reset (NEEDS-CLARIFICATION trigger does not apply) — confirmed DOM-only desync.

### Code Change — `frontend/src/app/components/device-dialog/device-dialog.component.html`
- WHAT: on the MIC select (`:61-65`), dropped the select's `[value]="selectedAudioId()"` and added `[selected]="device.deviceId === selectedAudioId()"` to each `<option>` (`:63`). Kept the `(change)="onAudioChange($event)"` handler and `[disabled]="busy()"`.
- WHY: `[selected]` is re-evaluated on every change-detection / re-render, so the correct `<option>` is marked selected even after the option list is re-created on reopen — the native select then renders the right value. The select-level `[value]` was dropped because, with `[selected]` now authoritative per-option, a stale select `[value]` would only re-apply on signal change and could fight the per-option selection; `[selected]` is the robust native-select pattern.

### Verification — this iteration
- `npx ng build` (frontend/, TS/template strict): **PASS** — "Application bundle generation complete." Only the same PRE-EXISTING unrelated warnings (NG8113 unused DatePipe in rooms.page, Stencil empty-glob, @mediapipe non-ESM). No template error from dropping `[value]`.
- `npx tsx src/app/services/device-selection.spec.ts` (frontend/): **PASS** — "device-selection: all assertions passed" (unaffected by the template change, as expected).
- No deploy (lead deploys after qa re-verifies).

## Standing Rules
None.

## Verification
- `npx ng build` (frontend/, TS strict): **PASS** — "Application bundle generation complete." Warnings present are all PRE-EXISTING and unrelated (NG8113 unused DatePipe in rooms.page, Stencil empty-glob, @mediapipe non-ESM).
- `npx tsx src/app/services/device-selection.spec.ts` (frontend/): **PASS** — "device-selection: all assertions passed". 8 assertion blocks (P1, P2, P3, P4, P5, P6a, P6b, P7-with-4-checks).
- Smoke: no deploy this dispatch (lead deploys to DEV after reviewer + qa).

## Bug Reproductions
The bug is reproduced AT MECHANISM LEVEL by unit cases P1 and P2: with `chosenId` a concrete enumerated mic and `trackReportedId` generic (`''` for P1, `'default'` for P2), the OLD `syncSelectedAudioIdToTrack` did `set('')`/`storeDevice('')` then `refreshDevices` snapped to `'default'`. The new resolver returns the kept `chosenId` (`'aaaa1111realhash'`). If the old unconditional overwrite were kept, P1 and P2 would fail — they are the regression proof for the reverting lines.

## Caveats
- PRE-EXISTING / low-probability display-lag (OUT OF SCOPE per JROM): the recovery call sites `recoverLocalAudioTrack` (`:2314`) and the mic-sweep adopt (`:2414`) also call `syncSelectedAudioIdToTrack`. If a track comes back from recovery momentarily reporting an empty/generic id while the resolver's branch-2/3 inputs are also transiently unusable, the picker label could briefly show a fallback before settling. This never affects actual capture (the track is live regardless of the displayed label) and is a display-lag only. Documented as out-of-scope per the brief; not addressed here.
- No e2e in this dispatch — qa authors `e2e/tests/b2-mic-persist/mic-persist.spec.ts` next.
- PRE-EXISTING (iter 2, OUT OF R2 SCOPE — DEFERRED): the **camera** select (`device-dialog.component.html:70-74`, `[value]="selectedVideoId()"` over `@for videoInputs()`) and the **speaker** select (`:79-92`, `[value]="selectedAudioOutputId()"` over `@for audioOutputs()`) have the IDENTICAL `[value]`-over-dynamic-options latent desync — on dialog reopen / option re-render they will likewise snap to their first option while the underlying signal is unchanged. Same trivial fix available (drop select `[value]`, add per-option `[selected]="device.deviceId === selected…Id()"`). NOT changed here because R2 is microphone-only. Recommend a follow-up issue to apply the same pattern to camera + speaker.
