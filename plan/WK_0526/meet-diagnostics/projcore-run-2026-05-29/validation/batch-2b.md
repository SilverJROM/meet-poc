# validation/batch-2b — projcore independent gate (R2)

**Verdict: PASS** · HEAD 1ba17b5 (branch feat/meet-diagnostics-audio-20260529) · B2 (a+b) complete.

## 7-gate
1. Artifacts ✓ (B2 scenarios/changes/review/test-report/independent-validation B2a+B2b sections + screenshots).
2. Diff review ✓ — 4 files +195/−3, watchdog-only, no scope creep. Verified:
   - `nextMicWarningState` (pure): !micActive→false; silent→true; working→false (auto-clear); indeterminate→current (no flicker). Correct.
   - `pollMicSilenceWatchdog`: ZERO device mutation (warn-only ✓); stale tick (state!=in-call)→self-stop (no post-leave warn); micActive=live+enabled+!muted, else clear window+banner (mute-gated ✓); rolling 6-sample (~5-6s) window @1s via shared classifyMicCapture + getOutboundAudioSource.
   - Lifecycle: startMicSilenceWatchdog in publish block; stopMicSilenceWatchdog + micSilentWarning.set(false) in cleanupCall (no leak ✓).
   - Unified surface: B2a still-silent path now sets micSilentWarning (single banner; watchdog auto-clear covers the one-shot too).
   - HTML: @if(micSilentWarning()) → role="status" non-blocking banner, "We can't detect sound from your microphone" + "Switch microphone" → openInCallDeviceDialog (existing picker).
3. Build ✓ backend + frontend green on 1ba17b5.
4. Targeted test ✓ mic-capture-health.spec.ts (B2a+B2b) + mic-energy.spec.ts no-regression — re-ran both, all passed.
5. Q0 — R2 detection+warn+switch+auto-clear+mute-gate covered (unit + diff). Residual: live forced-silent path M-4..M-8 (headless fake-media emits a tone → always 'working'; can't force silent published track headless) → Phase-2 USER-seat localhost confirm.
6. Coverage — R2 → VERIFIED (live-confirm @Phase2). R3 already VERIFIED (B2a).
7. Standing rules — no illegal deferral; MANUAL items are env limits; decisions present.

## Live-confirm (Phase 2, with B2c): forced-silent join → track kept + banner within ~5s → Switch microphone opens picker → restore live mic → banner auto-clears; mute while warned → clears; leave/rejoin → no leaked watchdog.
