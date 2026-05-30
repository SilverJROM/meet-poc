# Independent Validation — B2a (R3 capture-side guarantee)

**Validator:** independent / fresh-eyes (no plan, scenarios, or code review consulted)
**Date:** 2026-05-30
**Branch tip:** `b8fa5f7` ([batch-2a] root-cause silent-mic capture)
**Diff range inspected:** `3c1ebff..b8fa5f7` (5 source files + 2 artifacts, +655/-28)

REQUIREMENT (verbatim): "R3 — … on a silent/failed default the app does not silently
publish a dead track — it attempts recovery and/or surfaces R2." B2a scope: tolerant
constraints, ONE shared published-audio-energy reader, post-publish one-shot energy
check, bounded NON-DESTRUCTIVE recovery (never re-acquires a quiet-but-working mic,
never leaves zero audio, falls through to a non-blocking warn).

---

## 1. Unit proof — RE-RAN MYSELF, genuinely passes

```
$ cd frontend && npx tsx src/app/services/mic-capture-health.spec.ts
mic-capture-health: all assertions passed      EXIT=0
$ npx tsx src/app/services/mic-energy.spec.ts   (B1 regression)
mic-energy: all assertions passed               B1_EXIT=0
```

Import resolution confirmed sound: spec imports `from './mic-energy.js'`; only
`mic-energy.ts` exists on disk (no `.js` shadow — `ls` shows just `.ts` + `.spec.ts`),
so the assertions execute against the exact module I read. Not a stub.

**The make-or-break property (silence = FLAT energy over a window, NOT a single
audioLevel sample) — verified true:**
- `classifyMicCapture` (mic-energy.ts:107-133): builds `delta = lastEnergy − firstEnergy`
  over the window; `delta >= ENERGY_DELTA_EPSILON (1e-7)` ⇒ `working` and RETURNS BEFORE
  the level check. Only on FLAT energy does it consult `maxLevel < 0.01` for `silent`.
  `< 2` usable energy samples ⇒ `indeterminate` (never a false silence claim).
- **U-8 (mic-capture-health.spec.ts:103-107)** is the headline guard: energies
  `[0.50…0.55]` (rising) with EVERY `audioLevel = 0.004` (below the 0.01 threshold) ⇒
  asserts `'working'`. Traced against the code: delta 0.05 ≥ 1e-7 → `working` before any
  level look — a quiet-but-working mic is NOT re-acquired. False-positive guard holds.
- **U-7 (line 97-101):** flat energy 0.0001 + level 0.003 ⇒ `'silent'`. The decision is
  driven by `totalAudioEnergy` flatness, corroborated by level — exactly the bug
  (silent-but-live track) the gate must catch.
- U-10 (flat energy but level 0.4 ⇒ not silent), U-11 (single/all-null/empty ⇒
  indeterminate) further fence the boundary. Assertions are real `node:assert/strict`.

## 2. Recovery path — EXACTLY ONE non-destructive re-acquire of the SAME device, else keep+warn

`room.page.ts verifyInitialCaptureEnergy()` (2246-2296):
- One-shot guard set `true` at line 2248 **before any await** → a second `published`
  event cannot re-enter. Reset to `false` ONLY in `cleanupCall()` (1945, confirmed in
  context — sits among `stopLocal`/`closeLiveTracksForExit`). At most once per call.
- Gated via `captureGatePasses()` (2311-2331): in-call + live + `enabled===true` +
  `muted===false`. A muted/disabled user → returns early, no recovery (intentionally
  silent never treated as failure). Mirrored in the pure `decideMicRecovery` gate
  (mic-energy.ts:170) and asserted by U-15.
- On `reacquire-same-device`: ONE `media.replaceAudioTrack(decision.deviceId, …)`
  (2272), `decision.deviceId === selectedAudioId()` (SAME device, AC5 — U-12/U-17). On
  throw it's caught (2273-2275), old track untouched.
- `media.replaceAudioTrack` (media.service.ts:88-109) is genuinely non-destructive:
  acquires the NEW track via getUserMedia FIRST (93), `addTrack` (100), wires it (101),
  and only THEN removes/stops the old track (102-105). A getUserMedia throw or a
  null-track stream (96-99 returns null) leaves the existing track in place.
- Still-silent after the one re-acquire (or re-acquire null/threw): falls through to
  `deviceFailureNotice.set("We can't detect sound from your microphone. Open devices to
  pick another.")` (2294) + `queueDiagnosticsLog('error', …)`. **No second
  `replaceAudioTrack`, no `removeAudioTrack`, no `recoverLocalAudioTrack` (destructive
  path).** Track is KEPT. Zero-tracks state is unreachable from this gate. The action
  union (mic-energy.ts:144) contains no destructive value (U-16).

## 3. Energy reader is the SAME signal as diagnostics — no second meter

- `extractOutboundAudioSource` (mic-energy.ts:65-77) is the single `media-source`/audio
  extractor. `sfu-client.service.ts` calls it BOTH in `collectDiagnostics()` (356, over
  the existing single getStats pass — no duplicate loop) AND in the new public
  `getOutboundAudioSource()` (193-202, one getStats then the SAME extractor). The gate
  samples via `getOutboundAudioSource` (`sampleCaptureEnergy`, room.page.ts:2298-2309).
- Verified no new meter added in the batch:
  `git diff 3c1ebff..b8fa5f7 -- src/app | grep '^\+.*(new AudioContext|AnalyserNode|createMediaStreamSource)'`
  → **(none added).** The gate reuses the getStats outbound-audio source only.

## 4. Tolerant constraints — applied-when-supported, deviceId honored

`audioCaptureConstraints` (mic-energy.ts:47-55): EC/NS/AGC as `{ideal:true}` (best-effort,
not hard-required), `deviceId:{exact}` set ONLY when a device is chosen, `audio:false`
short-circuits to `false`. `media.service.ts audioConstraints()` (352-356) delegates to
it; the old hard-boolean `AUDIO_PROCESSING_CONSTRAINTS` const is gone. U-1..U-3 assert
all four properties incl. explicit rejection of the bare-boolean `true` form.
`preferredDeviceId` (room.page.ts:2884-2892) prefers the `'default'` audioinput first-run
before `devices[0]` — picks the OS-configured input the user actually tested.

## 5. Real-mic behavior honestly marked MANUAL-PENDING (not faked)

changes.md §Verification marks `Manual localhost:4700 — MANUAL-PENDING (real mic can't be
exercised headless)` and explicitly states "Not claiming PASS — these require a live
browser + mic at JROM's seat." M-1/M-2/M-3 are described as manual EXPECTations, not
asserted results. This is the correct, acceptable posture — the mechanism + the
deterministic unit proof carry the verdict; nothing is faked as green.

---

## Verdict

B2a satisfies R3's capture-side guarantee at the mechanism level with a genuine
deterministic proof. The published-audio path now (a) verifies energy via the SAME
diagnostics signal over a sustained ~3s window, (b) decides silence from FLAT cumulative
energy — never a single sample — so a quiet-but-working mic is classed WORKING and is
never re-acquired (the false-positive that would have re-acquired a working mic is
fenced by U-8 and the code path), (c) on confirmed silence attempts EXACTLY ONE
non-destructive re-acquire of the SAME selected device, and (d) on still-silent KEEPS
the existing track (never `removeAudioTrack`, never zero tracks) and surfaces a
non-blocking warn. One-shot guard reset on call cleanup; gated on enabled+unmuted+live.
No new AudioContext/meter. Constraints relaxed to `{ideal}` while honoring an explicit
deviceId. Both unit specs re-run green by me. Real-mic paths correctly MANUAL-PENDING.

No deviation from the contract found. R2 banner / switch-mic UI / continuous watchdog
are correctly out of scope (B2b).

STATUS: PASS

---
---

## Batch 2b — Independent Validation (R2 in-call silent-mic watchdog + warning)

**Validator:** independent / fresh-eyes (no plan, scenarios, or code review consulted)
**Date:** 2026-05-30
**Branch tip:** `1ba17b5` ([batch-2b] in-call silent-mic watchdog + non-blocking R2 banner)
**Diff range inspected:** `b8fa5f7..1ba17b5` (4 source files + 2 artifacts, +346/-3)

REQUIREMENT (verbatim): "R2 — Silent-mic detection + actionable warning. When a
participant's mic is enabled and unmuted but no audio energy is detected for a sustained
window (uses R1's signal), the app warns them with a non-blocking, actionable prompt
('We can't detect sound from your microphone') and offers to switch microphone (opens the
device picker). Clears when audio is detected." WATCHDOG MUST BE WARN-ONLY (no mid-call
auto device mutation).

---

## 1. Unit proof — RE-RAN MYSELF, genuinely passes; the reducer state machine is real

```
$ cd frontend && npx tsx src/app/services/mic-capture-health.spec.ts
mic-capture-health: all assertions passed      EXIT=0
```

The spec imports `nextMicWarningState` + `classifyMicCapture` from `./mic-energy.js`; only
`mic-energy.ts` exists on disk (no `.js` shadow), so assertions run against the exact
module I read. Real `node:assert/strict`, not a stub.

The warn state machine is proven across ALL transitions R2 requires:
- **silent ⇒ warn:** U-20 (line 207-208) `nextMicWarningState(false,'silent',true)===true`;
  also the silent-window path U-24 (line 257-259) — a flat 6-sample window classifies
  `'silent'` then the reducer ⇒ `true`.
- **working ⇒ clear:** U-20 (line 209) `(...,'working',true)===false`; U-23 auto-clear
  (line 252); U-26 silent-then-working window sequence ⇒ `false` (line 269-278).
- **indeterminate ⇒ no-change (no flicker):** U-22 (line 224-225) keeps current in BOTH
  current-states.
- **muted/disabled ⇒ no-warn AND clears:** U-21 (line 214-220) asserts `micActive===false`
  forces `false` for EVERY classification and BOTH current states — including the
  make-or-break `(true,'silent',false)===false` (warn showing, then user mutes ⇒ clears),
  re-proven as a window sequence in U-27 (line 281-287). This is the "enabled and
  unmuted" gate from R2.
- **Exhaustive 3×2×2 truth table** (line 229-248) independently recomputes the expected
  value for every `classification × micActive × current` and asserts the reducer matches.
  I traced the reducer (mic-energy.ts:154-163): `!micActive⇒false`, `silent⇒true`,
  `working⇒false`, else `current`. Matches the table exactly.

SUSTAINED property (reused from B2a's `classifyMicCapture`, unchanged): silence = FLAT
cumulative `totalAudioEnergy` over the window, NOT a single sample. U-25 (line 263-266)
is the DTX/speech-pause guard — energies `[10,10,11.7,12.4,12.4,12.4]` (rose then flat)
⇒ `'working'` ⇒ NO banner. A brief pause cannot false-trigger. `<2` usable samples ⇒
`indeterminate` ⇒ no change (thin-window guard).

## 2. SUSTAINED window on its OWN ~1s interval — not piggybacking the 7.5s logger

`room.page.ts`:
- `MIC_SILENCE_WATCHDOG_POLL_MS = 1_000`, `MIC_SILENCE_WATCHDOG_WINDOW = 6` (line 50-51)
  ⇒ own ~6s rolling window @ ~1s.
- `startMicSilenceWatchdog()` (2467-2473) arms a DEDICATED `window.setInterval(…, 1000)`
  stored in its OWN field `micSilenceWatchdogTimer` (372) — distinct from the diagnostics
  logger and the B2a one-shot gate. Double-arm guard (`if (this.micSilenceWatchdogTimer
  || this.state() !== 'in-call') return`).
- `pollMicSilenceWatchdog()` (2481-2507) pushes one `{audioLevel,totalAudioEnergy}` sample
  per tick, caps to 6 (`shift()` at 2503), classifies the rolling buffer via
  `classifyMicCapture(this.micSilenceWindow)` (2505). So a decision is made over a
  multi-second multi-sample window, not a single read. NOT piggybacking the coarse 7.5s
  diagnostics logger (that is `startDiagnosticsLogger`, a separate timer at 1348).

## 3. WARN-ONLY — make-or-break: the poll body performs ZERO device mutation

I read the entire `pollMicSilenceWatchdog` body (2481-2507). It does exactly three things:
self-stop if not in-call, read `getOutboundAudioSource()`, and `set` the `micSilentWarning`
signal via the pure reducer. **No `replaceAudioTrack`, no `recoverLocalAudioTrack`, no
`removeAudioTrack`, no `changeAudioDevice`, no `getUserMedia`.** Grep of the whole file
for those calls returns ONLY: line 784 `changeAudioDevice` (user-initiated picker handler),
2007/2017 (inside `changeAudioDevice`), 2208/2227/2241-2242 (`recoverLocalAudioTrack`,
the onended/onmute destructive path — NOT called by the watchdog), and 2286 (B2a's
one-shot gate). None are inside the watchdog poll. The ONLY device action reachable from
the banner is the USER clicking "Switch microphone" → `openInCallDeviceDialog()`
(837-841), which only sets `inCallDeviceDialogOpen.set(true)` + refreshes the device list
(the existing in-call picker). The watchdog itself never thrashes the mic.

## 4. The banner — non-blocking, exact text, switch action, auto-clears, ONE surface

`room.page.html` (194-199):
```
@if (micSilentWarning()) {
  <div class="device-notice" role="status">
    <span>We can't detect sound from your microphone</span>
    <button type="button" (click)="openInCallDeviceDialog()">Switch microphone</button>
  </div>
}
```
- **Non-blocking:** `role="status"` (not a modal/dialog/alertdialog), sits inline in the
  same in-call notice stack as `deviceFailureNotice`/`actionNotice`. `.device-notice` scss
  (room.page.scss:463-476) is `display:flex` with `margin` only — NO `position:fixed`/
  `absolute`, no backdrop, no focus-trap. Does not modal-trap or block call controls.
- **Exact text:** literally `We can't detect sound from your microphone` (no trailing
  sentence — the action button replaces it). Verified `grep "can't detect sound from your
  microphone" room.page.ts` → ZERO matches: the copy lives only in the HTML banner.
- **Auto-CLEARS:** each poll re-sets the signal via `nextMicWarningState(...,'working',true)
  ⇒ false` (2506) — energy returning clears it with NO user click. Proven by U-23/U-26.
- **ONE silent-mic surface (AC-B8 unify):** B2a's one-shot still-silent fallback now sets
  `this.micSilentWarning.set(true)` (room.page.ts:2310) instead of writing the silent-mic
  copy to `deviceFailureNotice`. So the one-shot gate AND the continuous watchdog drive
  the SAME signal — no double-banner; the watchdog's `working⇒false` also clears the
  one-shot case. (The unrelated `deviceFailureNotice` "No microphone available…" copy is
  a DIFFERENT condition and correctly stays on its own banner.)

## 5. No-leak — interval cleared on call cleanup

`cleanupCall()` (1944-1988) calls `this.stopMicSilenceWatchdog()` (1947) which
`clearInterval`s, nulls the handle, and clears the buffer (2475-2479), plus
`this.micSilentWarning.set(false)` (1986). Additionally `pollMicSilenceWatchdog` self-stops
if `state() !== 'in-call'` (2483-2486) so a stale in-flight tick after leaving can't warn.
No interval survives leaving; rejoin re-arms a fresh watchdog (double-arm guard prevents
duplicates). No per-leave/rejoin interval growth.

## 6. Live-mic scenarios honestly MANUAL-PENDING (not faked)

changes.md §Verification marks `Manual localhost:4700 — MANUAL-PENDING (NS5: forced-silent
path; Playwright fake-media emits a TONE ⇒ always 'working', cannot force a silent
PUBLISHED track headless)` and states "Not claiming PASS — these require a live browser +
the forced-silent harness at JROM's seat." M-4..M-8 are EXPECTations, not asserted
results. Correct posture — the fake-media tone limitation is real and the unit proof +
mechanism carry the verdict; nothing faked green.

---

## Verdict

B2b satisfies R2 at the mechanism level with a genuine deterministic proof. A dedicated
in-call watchdog polls the SAME getStats outbound-audio source on its OWN ~1s interval,
classifies a rolling ~6-sample (~5-6s) window with B2a's flat-cumulative-energy
`classifyMicCapture` (so a brief speech pause / DTX does NOT false-trigger — U-25), and
drives a single `micSilentWarning` signal through the pure `nextMicWarningState` reducer:
silent⇒warn, working⇒auto-clear, indeterminate⇒no-flicker, and muted/disabled⇒no-warn
(and clears if showing) — the "enabled and unmuted" gate. The banner is non-blocking
(`role=status`, inline, no modal/backdrop/focus-trap), uses the exact required copy,
offers "Switch microphone" → the existing in-call device picker, and auto-clears when
energy returns. WARN-ONLY confirmed: the poll body performs ZERO device mutation — the
only device action is the user clicking the button. The one-shot B2a fallback was unified
onto the same signal (one surface, no double-banner). The interval is cleared in
`cleanupCall` and the poll self-stops post-leave (no leak). Unit spec re-run green by me.
Live forced-silent paths correctly MANUAL-PENDING (fake-media tone limitation is genuine).

No deviation from the contract found.

STATUS: PASS
