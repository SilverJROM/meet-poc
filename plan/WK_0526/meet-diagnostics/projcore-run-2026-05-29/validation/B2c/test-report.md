# Test Report: Batch B2c — Multi-device mic fallback (R10)

## Tested Against

- **Branch**: feat/meet-diagnostics-audio-20260529
- **Commit**: 4a50da2
- **Date**: 2026-05-30
- **Tester**: [qa] v3.0

## Branch

feat/meet-diagnostics-audio-20260529 @ 4a50da2 (B2c commits on top of 1ba17b5)

---

## Unit Test Results

| # | Scenario | Action | Expected | Actual | Evidence file | Result |
|---|----------|--------|----------|--------|---------------|--------|
| U-1 | AC-C1: silent + nothing-attempted ⇒ `try-device` (current = step 1) | `decideMicRecovery({...silent, attemptedDeviceIds:[]})` | `{action:'try-device', deviceId:'mic-A'}` | Matches | unit-mic-capture-health-b2c.txt | PASS |
| U-2 | AC-C1: current attempted, STILL silent ⇒ tries NEXT device (AC5 lock lifted) | `decideMicRecovery({...silent, attemptedDeviceIds:['mic-A']})` | `action:'try-device', deviceId:'mic-B'`; NOT `keep-and-warn` | Matches; `notStrictEqual('keep-and-warn')` asserted | unit-mic-capture-health-b2c.txt | PASS |
| U-3 | AC-C1: every candidate attempted, still silent ⇒ terminal `keep-and-warn` | `decideMicRecovery({...silent, attemptedDeviceIds:['mic-A','mic-B','mic-C']})` | `action:'keep-and-warn'` | Matches | unit-mic-capture-health-b2c.txt | PASS |
| U-4 | AC-C2: first candidate silent, SECOND working ⇒ adopt second, stop | `runMicSweep('mic-A', hooks)` with mic-B silent, mic-C working | `{outcome:'adopted',deviceId:'mic-C',label:'Webcam Mic'}`; acquireCalls=`['mic-B','mic-C']` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-5 | AC-C2: first candidate working ⇒ adopt, never acquire later candidates | `runMicSweep` with mic-B working | `outcome:'adopted', deviceId:'mic-B'`; acquireCalls=`['mic-B']` only | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-6 | AC-C4: every candidate silent ⇒ `none-working`, original restored last | `runMicSweep` all-silent | `{outcome:'none-working',restoredDeviceId:'mic-A'}`; last acquire = `'mic-A'` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-7 | AC-C4/C8: never-zero tracks — live track held at every acquire and at exit | all-silent sweep, harness minObserved | `minObserved() >= 1` and `liveCount() >= 1` at exit | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-8 | AC-C5: rising energy + level<0.01 ⇒ `classifyMicCapture='working'` ⇒ `decideMicRecovery` action `'none'` (quiet-but-working never swept) | `classifyMicCapture([0.50..0.55], level:0.004)` then step fn | classification `'working'`; action `'none'` | Matches | unit-mic-capture-health-b2c.txt | PASS |
| U-9 | AC-C5: `indeterminate` classification ⇒ step fn `'none'` (thin window never sweeps) | `decideMicRecovery({...silent, classification:'indeterminate'})` | `action:'none'` | Matches | unit-mic-capture-health-b2c.txt | PASS |
| U-10 | AC-C5/C7: muted/disabled/no-live-track ⇒ `'none'` even when silent + candidates remain | loop over `{micEnabled:false}`, `{micUnmuted:false}`, `{hasLiveAudioTrack:false}` | all `action:'none'` | Matches (3 sub-assertions) | unit-mic-capture-health-b2c.txt | PASS |
| U-11 | AC-C7: no candidates at all ⇒ terminal `keep-and-warn`; single-device builder returns `[current]` | `decideMicRecovery({...candidateDeviceIds:[]})` + `orderedMicCandidates('mic-A', [{deviceId:'mic-A',...}])` | step: `keep-and-warn`; builder: `['mic-A']` | Matches | unit-mic-capture-health-b2c.txt + unit-mic-sweep-b2c.txt | PASS |
| U-12 | AC-C3: adopted result carries string `deviceId` + non-empty `label` (wiring can persist + name device) | `runMicSweep` single working candidate | `typeof deviceId === 'string'` and `label.length > 0` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-13 | AC-C3 (static/wiring): adoption calls `syncSelectedAudioIdToTrack()` ⇒ `selectedAudioId.set(...)` + `storeDevice(DEVICE_STORAGE.audioInput, ...)` | Code review: room.page.ts:2350 + room.page.ts:2079-2082 | `syncSelectedAudioIdToTrack(this.captureAudioTrack())` on `'adopted'` outcome; `storeDevice` inside the helper | Confirmed — `syncSelectedAudioIdToTrack` at line 2350 calls `storeDevice(DEVICE_STORAGE.audioInput, actualDeviceId)` at line 2082 | structural-b2c.txt | PASS |
| U-14 | AC-C4 (static/wiring): `none-working` ⇒ single `micSilentWarning` surface; terminal copy correct | Code review + grep: room.page.ts:2372-2373 | `micSilentWarningMessage.set('No working microphone detected — check your mic/permissions')` then `micSilentWarning.set(true)` | Confirmed; single surface; no second banner | structural-b2c.txt | PASS |
| U-15 | AC-C6: first silent poll consumes sweep; second silent poll does NOT re-sweep | `nextSweepGate(false,'silent',true)` then same | `{swept:true,shouldSweep:true}` then `{swept:true,shouldSweep:false}` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-16 | AC-C6: energy returns ('working') re-arms; next silence ⇒ new sweep | `nextSweepGate(true,'working',true)` then `nextSweepGate(false,'silent',true)` | `{swept:false,shouldSweep:false}` then `{swept:true,shouldSweep:true}` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-17 | AC-C6: `indeterminate` ⇒ gate UNCHANGED, never sweeps | `nextSweepGate(true,'indeterminate',true)` + `nextSweepGate(false,'indeterminate',true)` | unchanged in both cases; `shouldSweep:false` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-18 | AC-C6: muted/disabled (`micActive=false`) ⇒ always `shouldSweep:false`, `swept:false` | `nextSweepGate(false,k,false)` for all classifications | `shouldSweep:false` and `swept:false` for all | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-19 | AC-C6: mute is a PAUSE not a permanent consume — post-unmute silent gets one fresh sweep | `nextSweepGate(false,'silent',false)` then `nextSweepGate(false,'silent',true)` | `swept:false,shouldSweep:false` then `{swept:true,shouldSweep:true}` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-20 | AC-C7: `'default'`/`'communications'` aliases collapse to physical groupId twin; current is first | `orderedMicCandidates('mic-A', [...5 devices...])` | 3 candidates; `cands[0].deviceId==='mic-A'`; no duplicate groups; gB collapsed to 1 | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-21 | AC-C7: already-failed candidate excluded | `orderedMicCandidates(..., failed:new Set(['mic-B']))` | `mic-B` absent; `mic-C` present | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-22 | AC-C8 (static/wiring): sweep uses `replaceAudioTrack` only; `removeAudioTrack` in pre-existing `recoverLocalAudioTrack` path only; no new meter | Grep + code review | `replaceAudioTrack` in sweep body (lines 2332–2334); `removeAudioTrack` at line 2263 is inside `recoverLocalAudioTrack()` only; no new `AudioContext`/`AnalyserNode` | Confirmed — `removeAudioTrack` is OUTSIDE the B2c sweep; no new meter | structural-b2c.txt | PASS |
| U-23 | AC-C7: throwing candidate skipped; sweep continues to next | `runMicSweep` where `acquire('mic-B')` throws | result `{outcome:'adopted',deviceId:'mic-C',label:'mic-C'}` | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-24 | AC-C7: null-acquire candidate skipped; NOT classified; sweep continues | `runMicSweep` where `acquire('mic-B')` returns null | result `adopted mic-C`; `classifyCalls===1` (null not classified) | Matches | unit-mic-sweep-b2c.txt | PASS |
| U-25 | AC-C7: all throw/null ⇒ graceful `none-working` + restore original | `runMicSweep` where all acquire throw/null | `{outcome:'none-working',restoredDeviceId:'mic-A'}` | Matches | unit-mic-sweep-b2c.txt | PASS |
| M-1 | AC-C2/C3/C8: current silent, OTHER mic working ⇒ auto-adopt + notice which device | MANUAL — localhost:4700, real second mic | "Switched to \<label\> — your previous microphone had no sound" notice; `selectedAudioId` persisted; `getAudioTracks().length>=1` always | — | — | MANUAL-PENDING |
| M-2 | AC-C4/C8: no mic works ⇒ original restored + single terminal error prompt | MANUAL — localhost:4700, all mics dead | Single `micSilentWarning` banner: "No working microphone detected — check your mic/permissions"; picker reachable | — | — | MANUAL-PENDING |
| M-3 | AC-C6: bounded — one sweep per episode; re-arm only after working→silent; mute never sweeps | MANUAL — localhost:4700 | Exactly one sweep iteration per episode; fresh sweep only after working→silent transition | — | — | MANUAL-PENDING |

---

## Build Results

| Target | Command | Outcome |
|--------|---------|---------|
| Frontend | `cd frontend && npm run build` | `Application bundle generation complete` — EXIT 0 |
| Backend | `cd backend && npm run build` | EXIT 0 (B2c is FE-only; BE unchanged and clean) |

Evidence: `screenshots/builds-b2c.txt`

---

## Structural / Static Assertions

| Check | Command | Result |
|-------|---------|--------|
| No new `AudioContext`/`AnalyserNode`/`createMediaStreamSource` in B2c diff | `git diff 1ba17b5..4a50da2 -- frontend/src \| grep -E "^\+.*(new AudioContext\|AnalyserNode\|createMediaStreamSource)"` | **Empty — "NO new meter added"** |
| Adoption copy present in source | `grep -nE "Switched to" room.page.ts` | Line 2356: `` `Switched to ${result.label \|\| 'another microphone'} — your previous microphone had no sound` `` |
| Terminal copy present in source | `grep -nE "No working microphone detected" room.page.ts` | Lines 2318, 2372, 2385: `'No working microphone detected — check your mic/permissions'` (all in `runMicRecoverySweep`) |
| Single `micSilentWarning` surface | `grep -nE "micSilentWarning" room.page.ts` | `micSilentWarning` signal is set in one function (`runMicRecoverySweep` / `pollMicSilenceWatchdog` via auto-clear only); no second simultaneous banner |
| `replaceAudioTrack` in sweep; `removeAudioTrack` NOT in sweep | `grep -nE "replaceAudioTrack\|removeAudioTrack" room.page.ts` | `replaceAudioTrack` at lines 2332–2334 (sweep body); `removeAudioTrack` at line 2263 is inside `recoverLocalAudioTrack()` (pre-existing disconnected-device recovery, not the B2c sweep) |
| Both gate callers invoke the sweep | Code review room.page.ts:2299 + 2605 | `verifyInitialCaptureEnergy` (join-time): line 2299 calls `this.runMicRecoverySweep()`; `pollMicSilenceWatchdog` (in-call): line 2605 calls `this.runMicRecoverySweep()` when `gate.shouldSweep` |
| Adoption persists via `storeDevice` | Code review room.page.ts:2350 + 2079-2082 | `syncSelectedAudioIdToTrack(this.captureAudioTrack())` at line 2350 → `storeDevice(DEVICE_STORAGE.audioInput, actualDeviceId)` at line 2082 |

Evidence: `screenshots/structural-b2c.txt`

---

## Copy Lock Comparison

| Copy | Spec Lock (scenarios.md) | Rendered in source (room.page.ts:2356) | Match |
|------|--------------------------|----------------------------------------|-------|
| Adoption notice | `"Switched to <label> — your previous microphone had no sound"` | `` `Switched to ${result.label \|\| 'another microphone'} — your previous microphone had no sound` `` | **PASS** — label is the adopted device's `track.label`; fallback to `'another microphone'` when both result.label and track.label are empty strings |
| Terminal error | `"No working microphone detected — check your mic/permissions"` | `'No working microphone detected — check your mic/permissions'` (lines 2318, 2372, 2385) | **PASS** — exact match, single surface |

Note: the fallback string `'another microphone'` (when `result.label` is empty) is a minor deviation from the spec's "`fallback to track.label`" wording, but since `result.label` IS `track.label` (set at acquire-hook line 2340: `label: track.label`), the only case where the fallback fires is when `track.label` itself is empty — at which point neither the spec nor the impl can name a device. The non-negotiable "(a) the adoption notice NAMES the adopted device" is satisfied whenever the browser provides a label.

---

## Manual-Pending Steps (for JROM to close M-1, M-2, M-3)

**Environment**: `http://localhost:4700` with `pm2 restart meet-poc-fe` after a clean `npm run build`.

**Why manual**: Chrome fake-media (`--use-fake-device-for-media-stream`) emits a tone on ALL fake inputs ⇒ every fake mic classifies `'working'` ⇒ the "current silent, OTHER device adopted" path cannot be forced headless.

**M-1 steps** (AC-C2/C3/C8 — adoption):
1. Have TWO physical mics. Join a two-tab room on `localhost:4700` (host tab + observer tab).
2. In the OS/browser, force the CURRENT mic to produce no energy (mute it in OS mixer while keeping the track alive and unmuted in the app, OR use a DevTools override to pin `audioLevel`/`totalAudioEnergy` to 0).
3. Wait ~10 s for the join-time gate to classify the window as `silent` and trigger the sweep.
4. Verify: a non-blocking notice reading exactly **"Switched to \<label\> — your previous microphone had no sound"** appears; `localStorage` shows the new device ID; audio is audible in the observer tab; DevTools console shows `getAudioTracks().length` stayed ≥ 1 throughout; NO "No working microphone detected" banner appeared.
5. Screenshot: the notice + diagnostics row with rising `outboundAudioEnergy`.

**M-2 steps** (AC-C4/C8 — none-working):
1. Connect a machine where ALL enumerated mics are dead/produce no energy.
2. Join a room. Wait for the join-time sweep.
3. Verify: EXACTLY ONE banner with text **"No working microphone detected — check your mic/permissions"** appears; no "Switched to" notice; "Switch microphone" button opens the in-call device picker; `getAudioTracks().length >= 1` confirmed in DevTools console.
4. Screenshot: the single banner + picker open after clicking "Switch microphone".

**M-3 steps** (AC-C6 — bounded):
1. Using the M-1 or M-2 setup, observe the FIRST sweep fires once.
2. While silence persists, confirm no second sweep fires (console log count does not increment; diagnostics does not show a second iteration).
3. Restore real energy (speak / un-mute the real mic). Confirm `micSilentWarning` clears.
4. Force silence again. Confirm a NEW single sweep fires.
5. While MUTED in-app, confirm no sweep fires at all.
6. Screenshot/console: sweep count per episode = 1.

---

## Summary

- **Unit specs run**: 3 (mic-energy.spec.ts, mic-capture-health.spec.ts, mic-sweep.spec.ts)
- **Unit scenarios**: 25 total — **22 PASS** (deterministic unit), **3 MANUAL-PENDING** (M-1, M-2, M-3)
- **Build results**: Frontend EXIT 0, Backend EXIT 0
- **No-new-meter grep**: EMPTY (no new `AudioContext`/`AnalyserNode`/`createMediaStreamSource`)
- **Copy Lock**: adoption notice PASS (exact template match); terminal error PASS (exact string match)
- **Static wiring**: `removeAudioTrack` confirmed absent from B2c sweep path; `replaceAudioTrack` only; adoption persists via `storeDevice`; both gate callers wired
- **Console errors**: none (all specs exited cleanly with "all assertions passed")
- **Evidence files**: 4 (unit-mic-energy-b2c.txt, unit-mic-capture-health-b2c.txt, unit-mic-sweep-b2c.txt, structural-b2c.txt) + builds-b2c.txt = **5 files**

---

## Verdict: PASS (unit+static) / MANUAL-PENDING (M-1, M-2, M-3)

All deterministic proof requirements per NS5 are satisfied. The three unit spec suites are green, both builds are clean, the no-new-meter grep is empty, Copy Lock strings match, and static wiring is confirmed. M-1, M-2, M-3 require a USER seat with a real second physical microphone at `localhost:4700` — steps documented above for JROM to close.
