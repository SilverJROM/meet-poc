# validation/batch-2a — projcore independent gate (R3; R2 partial)

**Verdict: PASS** (projcore independent review) · HEAD b8fa5f7 (branch feat/meet-diagnostics-audio-20260529)

## Root cause (confirmed correct against forensics)
No energy verification anywhere in capture→publish. getUserMedia resolve ≠ working mic (silent-but-live device: wrong channel / OS-mixer-muted / dead-but-enumerating external). doPublish ships any track. onended/onmute NEVER fire for a silent-but-live track → existing recovery never trips. B1's micSilent was computed but only logged, never acted on. Triggers: hard EC/NS/AGC booleans + first-run devices[0]. Matches 0%-loss + healthy-video + ~0-audio-RTP forensics exactly.

## 7-gate
1. **Artifacts** ✓ scenarios(19U+3M)/changes/review/test-report/independent-validation + screenshots.
2. **Diff review** ✓ 5 files +486/−28, audio-capture only, no scope creep. Verified both pure logic AND wiring:
   - `classifyMicCapture` — WORKING when totalAudioEnergy delta ≥ 1e-7 over window EVEN if all audioLevel sub-threshold (U-8 quiet-mic guarantee); SILENT only on flat energy AND maxLevel<0.01; <2 samples → indeterminate. **My must-do #1 (sustained/flat, not instantaneous) honored.**
   - `decideMicRecovery` — action union has NO destructive member → never-zero-audio enforced by the TYPE. Only 'silent'+enabled+unmuted+live actionable; first→reacquire SAME device; second→keep-and-warn. **Must-dos #1,#2 honored.**
   - Wiring (`verifyInitialCaptureEnergy`) — one-shot guard set BEFORE first await (no re-entrancy) + reset in cleanupCall; `captureGatePasses` gates live+enabled+unmuted (muted/joining-muted skipped); ~3s window (500ms warm + 5×700ms); re-acquire via replaceAudioTrack (old kept until new live; throw→old stays; null→keep+warn); still-silent → deviceFailureNotice warn, KEEPS track, never removeAudioTrack/recoverLocalAudioTrack.
   - `media.service.ts` — AUDIO_PROCESSING_CONSTRAINTS → audioCaptureConstraints() {ideal:true}, deviceId:{exact} when chosen, no channelCount. **Must-do #3.**
   - `preferredDeviceId` — prefers 'default' before devices[0]. **Must-do #4.**
3. **Build** ✓ backend tsc + frontend ng build green (pre-existing warnings only).
4. **Targeted test** ✓ mic-capture-health.spec.ts "all assertions passed"; mic-energy.spec.ts no-regression passed (I re-ran both myself).
5. **Evidence Q0** — R3 capture-fix logic+wiring fully covered (unit + diff). Residual: live-mic M-1..M-3 (headless can't capture real mic) → Phase-2 / USER-seat localhost confirm + B2b live exercise. Risk LOW (energy gate is type-safe non-destructive).
6. **Coverage** — R3 → VERIFIED (capture fix). R2 → IN-PROGRESS (B2a gives the join-time warn; the in-call sustained watchdog + "Switch microphone" action + clears-on-energy is B2b).
7. **Standing rules** — no illegal deferral; MANUAL items are env limits not punts. Decisions present.

## Live-confirm (Phase 2): forced-silent join → track KEPT + warn appears, never zero-audio; live mic → no warn, energy rising. DB: micSilent reflects state.
