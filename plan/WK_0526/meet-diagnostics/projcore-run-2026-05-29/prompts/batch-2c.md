Batch-2c: Multi-device microphone fallback before warning (R10; amends AC5)

Invoke /lead. You are the hyper-focused IMPLEMENTER for ONE batch (B2c). Claude /projcore supervises from another session and validates independently. NO scope creep.

Batch ID: B2c
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Plan: <run-dir>/implementation-plan.md (read B2c section)
Read FIRST: <run-dir>/context-handoff.md (B2 a+b summary + the exact functions to change), og-requirements.md R10, north-star NS11.
Requirements: R10. North-star: NS11 (amends AC5), NS9, NS4 (deferral OFF), NS5 (tests), NS2 (hyper-focused).
Branch: CONTINUE on feat/meet-diagnostics-audio-20260529 (currently @ 1ba17b5). Commit B2c on top.
Lifecycle: post-live, Deferral OFF. Uncertainty → STATUS: NEEDS-CLARIFICATION.
Estimated: SHORT-MEDIUM (~30min). PROPOSE a split only if genuinely >30min.

WHAT JROM WANTS (verbatim): "ok, can we use a fallback of the other available mics when one mic fails and when there is non just prompt the user about the error"

This AMENDS B2a's AC5 lock ("re-acquire the SAME device only; never switch to a different concrete device"). That lock is now LIFTED. New recovery protocol, shared by the join-time gate AND the in-call watchdog.

Requirement (verbatim):
"R10 — Automatic fallback across available microphones (amends R3/AC5). On confirmed sustained silence (mic enabled+unmuted), the app re-acquires the current device once, then automatically tries each OTHER available microphone and adopts the first that produces audio energy (switching to it and notifying the user which device). ONLY when NO available microphone produces energy does it surface the error prompt. Recovery stays non-destructive (never zero audio tracks) and bounded to one sweep per silence episode (no thrash)."

Current state (B2 a+b, verify with file:line):
- mic-energy.ts: `decideMicRecovery` currently returns 'reacquire-same-device' | 'keep-and-warn' | 'none' (same-device only). `classifyMicCapture` (flat-energy discriminator) + `nextMicWarningState` (banner reducer) are the pure helpers. `getOutboundAudioSource()`/`extractOutboundAudioSource` is the shared energy reader.
- room.page.ts: `verifyInitialCaptureEnergy` (one-shot join gate, room.page.ts ~2246) does the same-device re-acquire then sets micSilentWarning. `pollMicSilenceWatchdog` (~2481) is warn-only, drives micSilentWarning.
- media.service.ts: `replaceAudioTrack(deviceId, onTrackChanged)` (keeps old track until new live; survives throw/null), `audioCaptureConstraints`. Device list: the existing device-enumeration signal (find it — likely audioInputs / refreshDevices).

Expected (acceptance criteria — concrete, observable):
1. On confirmed sustained silence (enabled+unmuted): re-acquire CURRENT device once (relaxed) → if still silent, iterate OTHER available audioinput devices and adopt the FIRST whose captured track classifies 'working'.
2. On adopting a different device: update selectedAudioId + persist + notify the user which device was chosen (e.g. a notice "Switched to <label> — your previous microphone had no sound"). Do NOT silently switch.
3. If NO available device produces energy: KEEP the best existing track (NON-DESTRUCTIVE — never zero audio tracks) and surface the persistent silent-mic prompt (micSilentWarning + an error-flavored message). The "Switch microphone" action still opens the picker.
4. A quiet-but-WORKING mic (rising cumulative energy) is NEVER swept/switched (U-8 preserved).
5. Bounded: ONE full sweep per silence episode; re-arm only after energy returns then drops again (cooldown — no thrash). Muted/disabled → no sweep.
6. Candidates deduped by deviceId AND groupId (don't test the same physical device twice; skip the already-failed one; 'default' alias handled).

Design (keep the decision PURE + unit-testable):
- Turn `decideMicRecovery` into a pure STEP function: given (classification, micEnabled, micUnmuted, hasLiveAudioTrack, candidateDeviceIds (ordered, deduped, failed-excluded), attemptedDeviceIds) → next action: { action: 'try-device', deviceId } | { action: 'keep-and-warn' } | { action: 'none' }. The WIRING runs the bounded loop (try-device → replaceAudioTrack → re-sample ~1.5-2s → classify → repeat or stop). Keep classify/sample reused.
- Extract ONE shared recovery routine in room.page.ts that BOTH verifyInitialCaptureEnergy (join gate) and pollMicSilenceWatchdog (in-call) invoke on confirmed silence. The watchdog becomes: detect silence → run the shared sweep ONCE per episode → if it adopts a device, clear the banner; if none work, show the persistent warn. (The watchdog is no longer strictly warn-only — it now triggers the bounded auto-sweep, per NS11 — but still NEVER loops/thrashes: one sweep per episode.)

Scope guards:
- B2c ONLY (R10). Do NOT touch B5/B3/B4/B6 scope, SFU/transport, layout, unrelated code. Surgical.
- PRESERVE every B2a/B2b invariant: non-destructive (never end with zero audio; replaceAudioTrack keeps old until new is live; a throwing/failed candidate is skipped, not fatal), bounded, mute-gated, no new AudioContext/meter (reuse classifyMicCapture + getOutboundAudioSource), single micSilentWarning surface.
- Robust polled assertions — assert OUTCOME (adopted device / kept-track+warn), not that a fn fired.
- Deterministic proof via Playwright fake-media: a forced-silent primary + a working secondary fake input → auto-switches to the secondary (asserted) + notice; all-silent → keep track + persistent warn (assert audio tracks > 0 always); quiet-but-working → NO sweep. Real-device path = manual localhost note (NS5).
- If you hit a wall, STATUS: BLOCKED with specifics — don't spiral.

Plan handshake (MANDATORY):
1. Read brief + handoff + the named functions.
2. Reply PROPOSED: how decideMicRecovery becomes the step fn, the shared sweep routine + where both callers invoke it, candidate ordering/dedupe, the one-sweep-per-episode bound + re-arm, planned files, risks, estimate.
3. End: STATUS: PROPOSED — <one-line>.
4. WAIT for projcore APPROVED-PLAN. REVISE-PLAN → fix → re-emit.

After APPROVED-PLAN: implement → build green (backend + frontend) → STATUS: DONE.

Artifacts under <run-dir>/validation/B2c/: scenarios.md, changes.md (Root Cause/Change mechanism + per-file WHY), review.md, test-report.md, independent-validation.md, screenshots/. decisions/ entry if any non-trivial call.

Completion protocol:
- Write callback to <run-dir>/callbacks.md FIRST: '[projcore callback] B2c <STATE> <note>'.
- End EVERY reply with: STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>.
