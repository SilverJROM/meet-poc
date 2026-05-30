# Changes — B2a: Root-cause silent-mic capture — tolerant constraints + shared energy reader + post-publish energy gate + bounded non-destructive recovery (R3)

**Branch:** `feat/meet-diagnostics-audio-20260529` (cut-from / on top of `3c1ebff` — B1 landed)
**Lifecycle:** post-live, Deferral OFF (no TODO/FIXME, no shims — slice finished).

---

## User Report (verbatim)

> "a US user with an external mic joined a call — the US user could hear JROM, but JROM could not hear the US user. They fell back to Google Meet, which worked." JROM: "ok but the user, said he can test the mic and its working then what is the problem here? is it the code? go ahead and fix this and improve the diagnostics if we can go you have greenlight go ham at this problem"

**Requirement (verbatim):**
> "R3 — Robust microphone selection (external mic actually used). The user's chosen input device is used on join and in-call; on a silent/failed default the app does not silently publish a dead track — it attempts recovery and/or surfaces R2. An external mic that works in Google Meet must be selectable and capture audio here."

---

## Root Cause (mechanism-level)

The capture→publish path never verifies the track carries ENERGY.

- `acquire()` (`media.service.ts`) and `replaceAudioTrack()` (`media.service.ts`) treat a `getUserMedia` RESOLVE as proof the mic works — but `getUserMedia` does NOT reject a live-but-silent device (wrong channel / OS-mixer-muted / dead external that still enumerates).
- `doPublish()` (`sfu-client.service.ts`) `addTransceiver`'s whatever track it is handed, no energy check.
- The ONLY safety nets were `MediaStreamTrack` `onended`/`onmute` (`room.page.ts` `attachLocalTrackFailureHandlers`), which a silent-but-LIVE track (`muted===false`, `enabled===true`, `readyState==='live'`) NEVER fires → `recoverLocalAudioTrack` never triggers.
- B1's `micSilent` was computed but only written to the 7.5s diagnostics payload (`buildDiagnosticsPayload`), never acted on.
- Triggers that PRODUCE the silent-live track: hard EC/NS/AGC booleans in `AUDIO_PROCESSING_CONSTRAINTS` (a pro/USB/multi-channel external mic can return a silent/wrong-channel track under hard-required processing) + first-run `preferredDeviceId` picking `devices[0]` instead of the OS-tracked default.

**Fix shape:** relax the constraints (best-effort EC/NS/AGC), add a post-INITIAL-publish one-shot gate that samples the SAME outbound-audio stat the diagnostics read, classifies it over a SUSTAINED window (energy increasing ⇒ working, even if quiet; flat + low level ⇒ silent), and on confirmed silence attempts ONE non-destructive relaxed re-acquire of the SAME device — keeping the existing track and warning the user if it stays silent. Never publishes/keeps a dead track silently; never ends with zero audio tracks.

---

## Code Changes (per file — WHAT + WHY)

### 1. `frontend/src/app/services/mic-energy.ts` (pure module — extended)
- **WHAT:** Added four framework-free pure helpers (no Angular/DOM/AudioContext):
  - `audioCaptureConstraints(audio, deviceId?)` — EC/NS/AGC as `{ideal:true}`, `deviceId:{exact}` only when chosen, `audio:false`→`false`. No channelCount/sampleRate (the gate is the net).
  - `extractOutboundAudioSource(stats)` — factored-out media-source/audio extractor (`audioLevel`/`totalAudioEnergy`, non-number→null), the ONE source of truth.
  - `classifyMicCapture(window, opts?)` → `'silent'|'working'|'indeterminate'` — the SUSTAINED discriminator. WORKING when `totalAudioEnergy` last−first delta ≥ `ENERGY_DELTA_EPSILON` (1e-7), even at low level; SILENT only when energy is flat AND max `audioLevel` < `MIC_SILENCE_LEVEL_THRESHOLD`; INDETERMINATE with <2 usable energy samples.
  - `decideMicRecovery(input)` → `{action:'reacquire-same-device'|'keep-and-warn'|'none', deviceId}` — bounded non-destructive recovery predicate. Only `silent` is actionable; gated on enabled+unmuted+live; first pass → reacquire SAME device; already-attempted → keep-and-warn. No destructive action exists in the union.
- **WHY:** Isolation > DRY — all decision logic is pure and `tsx`-testable with zero browser deps. One extractor = one source of truth for diagnostics AND the gate. The discriminator NEVER decides silence from a single instantaneous sample.

### 2. `frontend/src/app/services/media.service.ts`
- **WHAT:** Removed the `AUDIO_PROCESSING_CONSTRAINTS` hard-boolean const; imported `audioCaptureConstraints` from `./mic-energy`; `private audioConstraints()` now delegates to it.
- **WHY:** Relaxes EC/NS/AGC to applied-when-supported (`{ideal:true}`) so an external interface that can't honour hard-required processing still yields a working track. `deviceId:{exact}` behaviour unchanged. Single pure builder is the AC1 unit-test surface.

### 3. `frontend/src/app/services/sfu-client.service.ts`
- **WHAT:** Imported `extractOutboundAudioSource` + `OutboundAudioSourceStat`. `collectDiagnostics()` now sets `outboundAudioSource = extractOutboundAudioSource(stats)` over its existing single `getStats()` pass (removed the inline dedicated media-source loop — no duplicate loop, no second `getStats`). Added a public `async getOutboundAudioSource(): Promise<OutboundAudioSourceStat|null>` that does one `getStats()` then the SAME extractor.
- **WHY:** One source of truth shared by diagnostics and the gate. The public reader is the gate's sampling primitive; it reuses the getStats signal only — no new AudioContext/AnalyserNode.

### 4. `frontend/src/app/pages/room/room.page.ts`
- **WHAT:**
  - Imported `classifyMicCapture`, `decideMicRecovery`, `EnergySample`. Added timing constants (`CAPTURE_ENERGY_GATE_INITIAL_DELAY_MS=500`, `_INTERVAL_MS=700`, `_SAMPLES=5`, `_RESAMPLES=3`) and the one-shot field `initialCaptureEnergyChecked` (reset in `cleanupCall()`).
  - In the `state?.status === 'published'` block (post the `sfu-publish` send), added `void this.verifyInitialCaptureEnergy()`.
  - Added `verifyInitialCaptureEnergy()`: one-shot guard; gate-passes check (in-call + live + enabled + unmuted); samples a ~3s window via `getOutboundAudioSource()`; `classifyMicCapture` → `decideMicRecovery`. On `reacquire-same-device`: ONE `media.replaceAudioTrack(selectedAudioId, …)` (non-destructive — keeps old track until new is live), re-wire failure handlers + mic level + broadcast, re-sample ~2s, re-classify; if `working` → `queueDiagnosticsLog('state-change','audio recovered via relaxed re-acquire')`. If re-acquire null/threw OR still silent → KEEP the existing track and set `deviceFailureNotice` to "We can't detect sound from your microphone. Open devices to pick another." + `queueDiagnosticsLog('error','initial capture silent; kept track, warned user')`. Helpers: `sampleCaptureEnergy`, `captureGatePasses`, `captureAudioTrack`, `captureTrackLive/Enabled/Unmuted`.
  - `preferredDeviceId()`: first-run (nothing stored/current) prefers the `deviceId==='default'` audioinput before `devices[0]`.
- **WHY:** Acts on the energy signal at the one moment a dead-but-live track would otherwise publish silently. Recovery is bounded (one re-acquire), non-destructive (never `removeAudioTrack`, never zero tracks), and device-stable (same id only). The default-device one-liner makes first-run pick the OS-configured input the user actually tested.

### 5. `frontend/src/app/services/mic-capture-health.spec.ts` (NEW — node-assert test)
- **WHAT:** Mirrors B1's `node:assert/strict` + final `console.log` pattern. Covers AC1 (U-1..U-3), AC2 (U-4..U-6 incl. partial/no-source nulls), AC3 (U-7..U-11 incl. the quiet-but-working boundary and indeterminate), AC4/AC5 (U-12..U-17 incl. one-shot bound, gating, keep-and-warn, same-device-only).
- **WHY:** Primary proof for capture logic that cannot be exercised headless. The discriminator (U-8) and recovery bound (U-13/U-16) are the headline assertions.

---

## Commits

| Hash | Subject |
|------|---------|
| `<filled below>` | [batch-2a] root-cause silent-mic capture: tolerant constraints + shared energy reader + post-publish energy gate + bounded non-destructive recovery \| scenarios: U-1..U-19, M-1..M-3, AC1..AC5 |

Staged ONLY the five changed source files + the two B2 artifacts (changes.md, unit-test-output.txt). Carried-over modified `plan/.../list/...` and untracked junk intentionally excluded. Committed on top — no amend/rebase/merge.

---

## Standing Rules

None introduced.

---

## Verification

### Backend build — PASS
```
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
BACKEND_EXIT=0
```

### Frontend build — PASS
```
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
FRONTEND_EXIT=0
```
Warnings present (DatePipe unused in RoomsPage; Stencil empty-glob; @mediapipe CommonJS) are all PRE-EXISTING (documented in B1) and unrelated.

### Unit test — PASS
```
$ cd frontend && npx tsx src/app/services/mic-capture-health.spec.ts
mic-capture-health: all assertions passed
EXIT=0
```
B1 regression — still green:
```
$ cd frontend && npx tsx src/app/services/mic-energy.spec.ts
mic-energy: all assertions passed
EXIT=0
```

### AC2 static (U-5) — PASS (one extraction definition site)
`grep "stat.type === 'media-source'"` matches ONLY `mic-energy.ts:69` (the shared extractor). `sfu-client.service.ts` references to "media-source" are comments only — no inline loop in `collectDiagnostics`.

### U-18 static (no new meter) — PASS
```
$ git diff 3c1ebff -- frontend/src/app | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"
(no added matches)
```
The energy gate reuses the getStats outbound-audio source only.

### U-19 wiring — PASS (one-shot, at the published block)
`void this.verifyInitialCaptureEnergy()` sits inside the `if (state?.status === 'published')` block (post `sfu-publish` send). `initialCaptureEnergyChecked` guards at-most-once per call and is reset in `cleanupCall()`. No continuous mid-call polling (that is B2b).

### Manual localhost:4700 — MANUAL-PENDING (NS5: real mic can't be exercised headless)
Run from JROM's USER-seat on `http://localhost:4700` (after `cd frontend && npm run build && pm2 restart meet-poc-fe`):
- **M-1 (healthy mic):** host joins with a real working mic, unmuted, speaks in the first ~3s after publish. EXPECT: diagnostics `outboundAudioEnergy` increasing + `micSilent:false`; NO `deviceFailureNotice`; NO re-acquire (device unchanged); audio audible to guest.
- **M-2 (forced-silent track):** host joins with a forced-silent audio track (enabled + unmuted + live, flat `totalAudioEnergy` — e.g. a 0-gain WebAudio oscillator track or a DevTools override that pins `audioLevel`/`totalAudioEnergy` flat). EXPECT: classification silent → EXACTLY ONE re-acquire on the SAME `selectedAudioId` (device id unchanged, not a switch) → if still silent, `localStream().getAudioTracks().length` stays ≥ 1 (track KEPT, not removed) AND `deviceFailureNotice` = "We can't detect sound from your microphone. Open devices to pick another." → NO second re-acquire (bound respected).
- **M-3 (muted host):** host joins muted (`track.enabled=false`) or mutes before the window. EXPECT: NO recovery, NO `deviceFailureNotice` (intentionally-muted is never a capture failure).

Not claiming PASS — these require a live browser + mic at JROM's seat.

---

## Bug Reproductions

The capture failure cannot be reproduced headless (no real mic in CI). The deterministic reproduction is the `classifyMicCapture` unit path (U-7: flat energy + low level ⇒ silent) plus the M-2 forced-silent manual path. The unit suite reproduces the decision boundary that the live bug exercised.

---

## Caveats

- **PRE-EXISTING:** `frontend/src/app/services/sfu-client.spec.ts` has an unrelated failure (noted in B1). Not touched; only the new `mic-capture-health.spec.ts` and B1's `mic-energy.spec.ts` are required to pass and do.
- **PRE-EXISTING (by design):** browsers that don't expose `media-source` audio stats yield a null window → `classifyMicCapture` returns `indeterminate` → no recovery (graceful, never a false silence claim). Same posture as B1.
- **By design (scope):** the dedicated R2 banner component, the "Switch microphone" action, and the continuous in-call watchdog are B2b — NOT in this batch. B2a reuses the existing `deviceFailureNotice` signal for the approved one-shot warn.
- **By design:** recovery is device-stable — it re-acquires the SAME `selectedAudioId` under relaxed constraints and never silently switches to a different concrete device (AC5). The destructive `removeAudioTrack()` path (`recoverLocalAudioTrack` fallthrough) is deliberately NOT used by the gate.
- **PRE-EXISTING (not touched):** B3 toggle, B4 attribution/view, B5 lobby self-test, B6 back-to-rooms, the SFU/transport/signaling, room layout, auth, and the lobby `AnalyserNode` preview meter (`media.service` `startMicLevel`) — all left alone.
- **Adjacent (NOT acted on):** the `default`-device preference in `preferredDeviceId` only helps when the platform actually enumerates a `'default'` audioinput (Chrome does; some browsers don't). Where absent, behaviour is unchanged (`devices[0]`). Listed per anti-discursive rule; no further action taken.

---

**STATUS: DONE**

---
---

# Changes — B2b: In-call SUSTAINED silent-mic WATCHDOG + non-blocking R2 banner with "Switch microphone"

**Branch:** `feat/meet-diagnostics-audio-20260529` (cut-from / on top of `b8fa5f7` — B2a landed + gate-passed). B2b commits ON TOP. No new branch, no merge.
**Lifecycle:** post-live, Deferral OFF (no TODO/FIXME, no shims — the warn surface is unified in-batch).

---

## User Report (verbatim)

> "a US user with an external mic joined a call — the US user could hear JROM, but JROM could not hear the US user." JROM: "go ham at this problem".

**Requirement (verbatim):**
> "R2 — Silent-mic detection + actionable warning. When a participant's mic is enabled and unmuted but no audio energy is detected for a sustained window (uses R1's signal), the app warns them with a non-blocking, actionable prompt ('We can't detect sound from your microphone') and offers to switch microphone (opens the device picker). Clears when audio is detected."

---

## Feature statement (mechanism-level)

The B2b in-call watchdog is the SAFETY-NET on top of B2a's join-time capture fix. B2a's one-shot energy gate only fires once near initial publish; a mic that goes silent LATER (OS-mixer mute, device drop, channel switch mid-call) would otherwise publish silence with no warning. B2b adds a CONTINUOUS in-call watchdog that polls the SAME getStats outbound-audio source (`sfuClient.getOutboundAudioSource()`) every ~1s, keeps a rolling ~5-6s window, classifies it with B2a's EXISTING pure `classifyMicCapture()`, and drives a dedicated `micSilentWarning` signal through a NEW pure reducer `nextMicWarningState()`. On sustained silence it surfaces a NON-BLOCKING, auto-clearing R2 banner ("We can't detect sound from your microphone") with a "Switch microphone" action that opens the existing in-call device picker. **WARN-ONLY** — the watchdog NEVER re-acquires/switches the device mid-call (that is B2a's job, and B2c's). Reuses B2a's primitives — NO new AudioContext/AnalyserNode/second meter.

---

## Code Changes (per file — WHAT + WHY)

### 1. `frontend/src/app/services/mic-energy.ts` (pure module — extended)
- **WHAT:** Added the framework-free pure reducer `nextMicWarningState(current, classification, micActive): boolean`. Rules: `micActive===false ⇒ false` (muted/disabled never warns; muting-while-shown clears); `'silent' ⇒ true`; `'working' ⇒ false` (auto-clear); `'indeterminate' ⇒ current` (no flicker). Handles the literal `'indeterminate'` from B2a's `MicCaptureClass` union (NOT `'unknown'`).
- **WHY:** AC-B1 headline — the warn-state transition is pure and `tsx`-testable with zero browser deps. The watchdog applies it each poll; the wiring is in room.page.ts.

### 2. `frontend/src/app/pages/room/room.page.ts`
- **WHAT:**
  - Imported `nextMicWarningState` from `./mic-energy`.
  - Added `readonly micSilentWarning = signal(false)` near the other in-call signals — the SINGLE silent-mic warn surface.
  - Added watchdog constants `MIC_SILENCE_WATCHDOG_POLL_MS = 1_000` and `MIC_SILENCE_WATCHDOG_WINDOW = 6` (~5-6s window @ ~1s — its OWN interval; the 7.5s diagnostics logger is too coarse).
  - Added fields `private micSilenceWatchdogTimer` and the rolling buffer `private micSilenceWindow`.
  - Added `startMicSilenceWatchdog()` (guards: no double-arm, in-call only; clears the buffer then sets the ~1s interval), `stopMicSilenceWatchdog()` (clearInterval + null + clear buffer), and the async tick `pollMicSilenceWatchdog()`: self-stops if no longer in-call (a stale tick can't warn after leaving); computes `micActive` = live + enabled + unmuted local audio track; if `!micActive` clears the buffer and sets `micSilentWarning` via `nextMicWarningState(current, 'indeterminate', false)` (⇒ false) and returns WITHOUT polling stats; else awaits `getOutboundAudioSource()`, pushes `{audioLevel, totalAudioEnergy}` (null-ish when src null) into the window, caps to 6, classifies via `classifyMicCapture`, and sets `micSilentWarning` via `nextMicWarningState(current, cls, true)`. The body contains ZERO device-mutation calls (warn-only).
  - Wired `this.startMicSilenceWatchdog()` at publish completion, adjacent to `this.startDiagnosticsLogger()`. Wired `this.stopMicSilenceWatchdog()` in `cleanupCall()` adjacent to `this.stopDiagnosticsLogger()`, and `this.micSilentWarning.set(false)` alongside `this.deviceFailureNotice.set(null)`.
  - **UNIFY (AC-B8):** in `verifyInitialCaptureEnergy()` the B2a still-silent fallback now sets `this.micSilentWarning.set(true)` instead of `this.deviceFailureNotice.set("We can't detect sound from your microphone. Open devices to pick another.")` — the one-shot fallback AND the continuous watchdog drive ONE surface; the watchdog's `'working'`⇒false auto-clear then also clears the one-shot case.
- **WHY:** Continuous sustained-silence detection on top of B2a's one-shot gate, reusing B2a's getStats source + classifier (no new meter). One warn signal = no double-banner. Lifecycle-bounded so no interval leaks on leave/rejoin.

### 3. `frontend/src/app/pages/room/room.page.html`
- **WHAT:** Added a NON-BLOCKING banner after the `deviceFailureNotice` block, gated `@if (micSilentWarning())`, reusing the `.device-notice` pattern with `role="status"`: text exactly `We can't detect sound from your microphone` + a `<button>Switch microphone</button>` whose `(click)` calls `openInCallDeviceDialog()` (the existing in-call picker). No Dismiss button (R2 auto-clears). No trailing "Open devices to pick another." sentence (the action button replaces it).
- **WHY:** Inline, non-modal status region in the same notice stack — does not modal-trap or block call controls. The action opens the existing picker; the watchdog itself never switches the device.

### 4. `frontend/src/app/services/mic-capture-health.spec.ts` (extended — node-assert)
- **WHAT:** Imported `nextMicWarningState` + `type MicCaptureClass`. Appended a B2b section: AC-B1 core transitions (U-20), mute gating both current states (U-21), indeterminate-keeps-current (U-22), an EXHAUSTIVE 3×2×2 truth table (every classification × micActive × current), auto-clear (U-23); AC-B2 flat ~5s window⇒silent⇒banner (U-24) + energy-rose⇒working⇒no-banner (U-25); AC-B3 silent→working window sequence auto-clears (U-26); AC-B4 mute-mid-silence clears (U-27). Reuses B2a's `classifyMicCapture` unchanged.
- **WHY:** Primary proof per NS5 (WebRTC mic can't be e2e'd headless). The reducer truth table is the AC-B1 headline.

---

## Commits

| Hash | Subject |
|------|---------|
| `<filled below>` | [batch-2b] in-call silent-mic watchdog + non-blocking R2 banner with Switch microphone; unify warn surface \| scenarios: U-20..U-32, M-4..M-8, AC-B1..AC-B8 |

Staged ONLY the four changed source files + the two B2 artifacts (changes.md, unit-test-output.txt). Committed on top of b8fa5f7 — no amend/rebase/merge.

---

## Standing Rules

None introduced.

---

## Verification

### Backend build — PASS
```
> @meet-poc/backend@0.1.0 build
> tsc -p tsconfig.json
BACKEND_EXIT=0
```

### Frontend build — PASS
```
Output location: /home/agjrom/websites/meet-poc/frontend/dist/meet-poc-frontend
FRONTEND_EXIT=0
```
Warnings (DatePipe unused in RoomsPage; Stencil empty-glob; @mediapipe CommonJS) are all PRE-EXISTING (documented in B1/B2a) and unrelated.

### Unit test — PASS
```
$ cd frontend && npx tsx src/app/services/mic-capture-health.spec.ts
mic-capture-health: all assertions passed
EXIT=0
```
Covers AC-B1 (U-20..U-23 + exhaustive 3×2×2 reducer truth table), AC-B2 (U-24/U-25), AC-B3 (U-26), AC-B4 (U-27).

B1/B2a regression — still green:
```
$ cd frontend && npx tsx src/app/services/mic-energy.spec.ts
mic-energy: all assertions passed
EXIT=0
```

### Static / wiring — PASS
- **U-28 (AC-B5):** `grep -nE "Switch microphone|openInCallDeviceDialog" room.page.html` → the banner button binds `(click)="openInCallDeviceDialog()"` with label "Switch microphone". The `pollMicSilenceWatchdog` body has ZERO `replaceAudioTrack`/`changeAudioDevice`/`recoverLocalAudioTrack`/`removeAudioTrack` calls (warn-only).
- **U-29 (AC-B6):** the banner is a single `<div class="device-notice" role="status">` in the same `@if`-guarded notice stack as `deviceFailureNotice`/`actionNotice` — NOT inside `app-device-dialog`, not a full-screen overlay; `.device-notice` scss is inline flex with no `position:fixed`/backdrop/focus-trap.
- **U-30 (AC-B7):** `startMicSilenceWatchdog()` is called at publish completion adjacent to `startDiagnosticsLogger()`; in-call guard + own `MIC_SILENCE_WATCHDOG_POLL_MS=1000` interval + new `micSilenceWatchdogTimer` field (not the 7.5s logger, not the one-shot B2a gate).
- **U-31 (AC-B7):** `cleanupCall()` calls `stopMicSilenceWatchdog()` (clears the interval, nulls the handle, clears the buffer) and `micSilentWarning.set(false)`; `pollMicSilenceWatchdog` self-stops when `state() !== 'in-call'` — no leaked interval, cleared banner, clean re-arm on rejoin.
- **U-32 (AC-B8):** `grep -nE "We can't detect sound from your microphone" room.page.ts` → ZERO matches (the silent-mic copy now lives ONLY in the HTML banner, driven by `micSilentWarning`). B2a's one-shot fallback re-pointed to `micSilentWarning.set(true)`. The unrelated "No microphone available…" `deviceFailureNotice` copy is a DIFFERENT condition and stays on its own banner.
- **No new meter:** `git diff b8fa5f7 -- frontend/src | grep -nE "^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)"` → NO added lines. Reuses `getOutboundAudioSource` + `classifyMicCapture`.

### Manual localhost:4700 — MANUAL-PENDING (NS5: forced-silent path; Playwright fake-media emits a TONE ⇒ always 'working', cannot force a silent PUBLISHED track headless)
Run from JROM's USER-seat on `http://localhost:4700` (after `cd frontend && npm run build && pm2 restart meet-poc-fe`), driving the banner with a forced-silent track (0-gain WebAudio oscillator published as the mic, or a DevTools override pinning the media-source `audioLevel`/`totalAudioEnergy` flat — test harness only, must NOT ship):
- **M-4 (sustained silence ⇒ banner):** join in-call with a forced-silent audio track (enabled+unmuted+live, flat energy). EXPECT: within ~5-6s a non-blocking banner reading exactly "We can't detect sound from your microphone" + a "Switch microphone" button; call controls remain usable (no modal).
- **M-5 (auto-clear):** with the banner showing, swap to a real working mic (or release the override) so energy rises. EXPECT: the banner CLEARS on its own within ~1-2 polls, no Dismiss click; `'indeterminate'` interim polls cause NO flicker.
- **M-6 (mute gating):** (a) join muted with a silent window ⇒ NO banner ever; (b) banner showing, click mute ⇒ banner CLEARS.
- **M-7 (action + non-blocking + single surface):** click "Switch microphone" ⇒ the existing in-call device picker opens (`inCallDeviceDialogOpen` true) AND the watchdog did NOT change the device itself; confirm only ONE silent-mic banner ever showed (no double-warn from B2a's one-shot + the watchdog).
- **M-8 (lifecycle):** in-call with the watchdog running, then Leave. EXPECT: the watchdog interval is cleared (no further `getOutboundAudioSource()` polls), the banner gone, rejoin re-arms a fresh watchdog; interval count does not grow per leave/rejoin.

Not claiming PASS — these require a live browser + the forced-silent harness at JROM's seat.

---

## Caveats

- **By design (scope):** WARN-ONLY. The watchdog never re-acquires/switches the device mid-call. Multi-device automatic fallback (NS11 / R10) is B2c, NOT this batch — the watchdog only sets/clears `micSilentWarning`.
- **By design (unify):** B2a's one-shot still-silent fallback now drives `micSilentWarning` (not `deviceFailureNotice`). A returning mic clears BOTH origins via the one signal (the watchdog's `'working'`⇒false). The longer B2a copy + the trailing "Open devices to pick another." instruction are replaced by the locked R2 copy + the "Switch microphone" action button.
- **PRE-EXISTING (not touched):** the unrelated `deviceFailureNotice` "No microphone available…" copy (room.page.ts ~2231) is a DIFFERENT failure condition and keeps its own banner — only the *silent-mic* warning is unified.
- **PRE-EXISTING:** `frontend/src/app/services/sfu-client.spec.ts` has an unrelated failure (noted in B1/B2a). Not touched; only `mic-capture-health.spec.ts` + `mic-energy.spec.ts` are required to pass and do.
- **PRE-EXISTING (not touched):** B3 on/off toggle, B4 attribution/view, B5 lobby self-test, B6 back-to-rooms, the SFU/transport/signaling, room layout, auth, and the lobby `AnalyserNode` preview meter — all left alone.

---

**STATUS: DONE**
