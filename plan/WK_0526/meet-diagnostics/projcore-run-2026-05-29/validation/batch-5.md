# validation/batch-5 — projcore independent gate (R8)

**Verdict: PASS** · HEAD 2c062ff (branch feat/meet-diagnostics-audio-20260529).

## Root cause (sharper than the brief — accepted)
Acquire parity already held post-B2a (lobby + call both route through audioConstraints→audioCaptureConstraints w/ same selectedAudioId). The false-pass = SIGNAL/CLASSIFICATION divergence: lobby meter was an instantaneous ×3-amplified RMS bar with NO sustained window / NO 'silent' verdict → any noise read "working"; in-call uses sustained classifyMicCapture. Fix = feed the lobby's existing analyser energy into the SAME classifier.

## 7-gate
1. Artifacts ✓ scenarios/changes/review/test-report/independent-validation + screenshots.
2. Diff review ✓ — 11 files +314/−2, lobby-self-test scope only, no touch to B2 in-call paths. Verified:
   - accumulateEnergyFrame (pure): frame mean-square → {cumulative totalAudioEnergy, RAW-RMS audioLevel (not ×3)}, NaN/neg-guarded. (my reaffirmation honored)
   - startMicLevel reuses the EXISTING meanSquare (no 2nd analyser/AudioContext — git-diff-proven) → 24-sample (~3s) rolling window; getMicCaptureWindow(); reset in stopMicLevel; ×3 display unchanged.
   - room.page lobbySelfTestFlag + ~1s poller gated on lobby+audioContextActivated+mic-on/live/enabled → classifyMicCapture → nextMicWarningState on a SEPARATE flag (not micSilentWarning). Same classifier+reducer+0.01 threshold.
   - flag UI in BOTH lobby-preview + device-dialog; non-blocking (Join stays enabled).
3. Build ✓ backend + frontend green.
4. Targeted test ✓ — re-ran all 4 specs (mic-energy, mic-capture-health, mic-sweep, mic-selftest) — all passed.
5. Q0 — R8 covered: U-3 silent→flag (same 0.01); rising/quiet→no flag (U-8); muted→no flag; **U-8 constraint-parity regression test deep-equals lobby vs call-path audioCaptureConstraints (the guard I required) + never {exact:""}**. No premature flag while window fills (indeterminate→hold). Residual: real dead-device flag in-browser M-1..M-3 = headless-impossible (fake-media tones) → USER-seat manual.
6. Coverage — R8 → VERIFIED (live real-device flag @manual).
7. Standing rules — no illegal deferral; no fabricated test; decisions logged.

## Live-confirm (manual): real silent mic → "No sound detected from <device>" flag in lobby + device-dialog (Join still enabled); working mic → no flag + call transmits; switch to working device → flag clears.
