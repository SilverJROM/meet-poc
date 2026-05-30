# validation/batch-2c — projcore independent gate (R10)

**Verdict: PASS** · HEAD 4a50da2 (branch feat/meet-diagnostics-audio-20260529). B2 (a+b+c) complete.

## 7-gate
1. Artifacts ✓ scenarios/changes/review/test-report/independent-validation + screenshots + decision.
2. Diff review ✓ — 5 files +696/−84, audio-recovery only, no scope creep. Verified:
   - decideMicRecovery → pure step fn: non-silent/gate-false → none (U-8 + mute); first unattempted candidate → try-device; all attempted → keep-and-warn.
   - runMicSweep orchestrator: every acquire wrapped — throw/null → skip, OLD TRACK KEPT (non-destructive); adopt first 'working'; all-fail → restore ORIGINAL device (not stranded) → none-working. Shared by join gate + watchdog.
   - nextSweepGate: one sweep per silence episode; re-arm only on 'working' (energy return) or !micActive (mute); indeterminate → unchanged.
   - candidate dedupe by deviceId AND groupId ('default'/'communications' alias collapse), empty/failed excluded; current-first.
   - all-fail banner via micSilentWarningMessage "No working microphone detected — check your mic/permissions"; single micSilentWarning surface; adopt notice suppressed when adopted===original.
3. Build ✓ backend + frontend green on 4a50da2.
4. Targeted test ✓ — I re-ran all 3 specs: mic-energy, mic-capture-health, mic-sweep — all passed.
5. Q0 — R10 logic + WIRING covered. **Never-zero invariant proven deterministically** in mic-sweep.spec.ts (minObserved()>=1 across sweep + liveCount()>=1 at exit — the mocked-acquire test I required; NOT hollow). Restore-original (AC-C4), indeterminate-no-sweep (U-17), muted-no-sweep (U-18) all asserted. Residual: live multi-device ADOPTION (real silent-primary→working-secondary) M-1..M-3 = headless-impossible (fake-media tones all inputs) → USER-seat manual.
6. Coverage — R10 → VERIFIED (live adoption confirm @manual/Phase2).
7. Standing rules — no illegal deferral; no fabricated test (explicitly refused); decisions logged.

## Live-confirm (manual): silent primary + working secondary → auto-switch + "Switched to <label>" + persists; only-silent mics → original restored + "No working microphone detected" banner, audio never 0; quiet-but-working → no sweep.
