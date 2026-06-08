# PHASE C — Build the regression test harness (T1 telemetry-replay + unit scenarios). Budget-aware.
You are the IMPLEMENTER (codex). Verifier!=fixer. TESTS + minimal pure helpers only; if a test reveals a REAL app bug, do NOT fix it here — record in ../issues/ISSUES.md and continue (Phase D fixes).
## FIRST tool call = callback: printf '[projcore callback] PHASE-C STATUS: PROPOSED %s\n' "$(date -u +%FT%TZ)" >> <abs>/callbacks.md ; plan → wait APPROVED-PLAN → build → DONE.
## Spec
- ../scenarios/CATALOG.md — 25 scenarios (12 historical H1-H12 + 13 researched R1-R13). Build T1/unit now; T2 real-browser DEFERRED (no pulseaudio/parecord on host; note it).
- ../archaeology/signatures.md — example real session IDs per signature. DB at ./data/meet-poc.sqlite (table meeting_session_diagnostics, col payload_json).
## Build (priority order; partial OK — callback if budget/time runs out)
1. DB fixture loader + fixtures: pull the getStats/diagnostics sequence for ONE representative real session per historical signature (H1-H12) and write JSON fixtures (under frontend test fixtures or e2e/fixtures). Real data = faithful.
2. `frontend/src/app/services/remote-audio-telemetry-replay.spec.ts` (tsx-runnable): feed each fixture's frames into the EXISTING pure decision adapters (currentAudioTrack, sampleUsable, remoteVoiceSample, voiceRecoveryWindowExhaustedWhileStalled, sampleWindowHasVoiceEnergy, decideVoiceRecovery, decideRemoteVoiceWatchdogAction, planSubscribeRetry, planSfuTransportRecovery, registry playoutDiagnostics/blockedReason) and ASSERT the correct ACTIONABLE state per CATALOG (not silent success). Map H1-H12.
3. Unit tests for researched decision-logic: R2 setSinkId taxonomy, R7 devicechange→sink-timeout, R8 opus-DTX false-positive (DTX silence must NOT trigger recovery/banner), R9 ICE-restart→re-subscribe, R10 mid-guard/glare, R11 volume>1→1.0 migration, R12 CF stale-track mapping. Reuse pure fns; behavior-preserving extraction only if needed.
## Constraints: tests + minimal pure helpers; no app-behavior change; RUN `cd frontend && npx tsc --noEmit`=0 + the new specs via npx tsx. Record (don't fix) any real bug in ../issues/ISSUES.md. Append PHASE-C to changes.md. NO commit.
Reply STATUS: PROPOSED + fixture-loader approach + which H/R covered + any extraction. Wait for APPROVED-PLAN.
