# context-handoff (rolling)

## Run start (pre-B1)
HEAD: 81661dd (baseline) · Branch base for run: feat/meet-diagnostics-audio-20260529 (to be created by /lead off 81661dd)
Implemented so far: nothing in this run.
Open in matrix: R1–R7 (all ASSIGNED).
Environment notes:
- App runs via PM2 (`meet-poc-be`, `meet-poc-fe`) from THIS tree; `localhost:4700` consolidated proxy; `voice.silverjrom.app` = same tree via CF tunnel (deploy reaches the live URL).
- Diagnostics: client POSTs to `/api/meeting-sessions/:sessionId/diagnostics`; backend gate `isAdmittedDiagnosticPoster` (signaling/index.ts); rows in `meeting_session_diagnostics` (owner_email = host_email always; payload_json holds clientId/clientName/participantId + sfuDiagnostics.inbound/outboundTracks).
- KEY FACT: `outboundAudioLevel`/`outboundAudioEnergy`/`micSilent` are null in 100% of existing samples — B1 fixes this.
- A localStorage flag `meet-poc.diagnosticsLogging` + `diagnosticsLoggingEnabled` signal already exist (room.page.ts ~line 181/2669) but have NO UI — B3 wires it.
Validation lessons: none yet.

## Accepted: Batch-1 — STATUS: PASS
HEAD: 3c1ebff
Branch: feat/meet-diagnostics-audio-20260529
Implemented: mic-energy.ts derives outboundAudioLevel/Energy/micSilent from RTCAudioSourceStats (media-source/audio); captured in sfu-client.service.ts own loop; wired in room.page.ts buildDiagnosticsPayload off ground-truth track state. Host+guest, per-sample.
Req#s closed: R1 (logic VERIFIED; live media-source emission to confirm @Phase2 / first real call).
Open in matrix: R2,R3 (B2) · R8 (B5) · R4,R5 (B3) · R6,R7 (B4) · R9 (B6).
Gotchas for B2: the local audio level signal is now available via deriveOutboundAudioFields / outboundAudioSource — B2's watchdog should reuse this exact signal (consistency with diagnostics). Silence threshold const = MIC_SILENCE_LEVEL_THRESHOLD (0.01) in mic-energy.ts; B2 must use a SUSTAINED window (~4-6s) to avoid flicker on natural speech pauses/DTX.
Validation lesson: media-source capture must stay OUT of the candidate-pair loop (break hazard).

## Accepted: Batch-2 (a+b) — STATUS: PASS
HEAD: 1ba17b5 · Branch: feat/meet-diagnostics-audio-20260529
Implemented: B2a capture root-cause fix (tolerant {ideal} constraints via audioCaptureConstraints; shared extractOutboundAudioSource/getOutboundAudioSource reader; one-shot post-publish verifyInitialCaptureEnergy gate; bounded NON-DESTRUCTIVE same-device recovery via decideMicRecovery; preferredDeviceId prefers 'default'). B2b in-call watchdog (pollMicSilenceWatchdog @1s, 6-sample window, classifyMicCapture + nextMicWarningState reducer → micSilentWarning banner with "Switch microphone"→openInCallDeviceDialog; warn-only; mute-gated; no-leak).
Req#s closed: R2, R3 (VERIFIED; live-confirm @Phase2). Earlier: R1.
Open: R10 (B2c, NEXT) · R8 (B5) · R4,R5 (B3) · R6,R7 (B4) · R9 (B6).
Deploy: HELD — deploy B2(a+b+c) together after B2c so JROM does ONE manual USER-seat test pass.
FOR B2c (multi-device fallback, amends AC5/NS11): the functions to change live in mic-energy.ts (decideMicRecovery → make it a pure step fn returning 'try-device <id>'|'keep-and-warn'|'none' given classification+gates+candidateList+attemptedSet) and room.page.ts (verifyInitialCaptureEnergy one-shot gate + pollMicSilenceWatchdog — extract a SHARED bounded recovery routine both can invoke). PRESERVE invariants: non-destructive (never zero audio; replaceAudioTrack keeps old until new live), U-8 (quiet-but-working never recovered), bounded (one sweep per silence episode), mute-gate, no new meter (reuse classifyMicCapture/getOutboundAudioSource), watchdog stays the warn surface (micSilentWarning). Dedupe candidates by deviceId/groupId; notify user which device on switch.

## Accepted: Batch-2c — STATUS: PASS
HEAD: 4a50da2 · Multi-device mic fallback (R10) landed. decideMicRecovery=step fn; runMicSweep shared orchestrator (join gate + watchdog); non-destructive (never zero audio, proven in mic-sweep.spec.ts); restore-original on all-fail; one-sweep/episode; dedupe deviceId+groupId.
Req closed: R10 (live adoption = manual). B2 family (R2,R3,R10) COMPLETE.
Open: R8 (B5 — self-test fidelity, NEXT), R4,R5 (B3), R6,R7 (B4), R9 (B6).
Deploy: B1+B2(a+b+c) deploying NOW to DEV (4a50da2).
For B5: reuse audioCaptureConstraints + getOutboundAudioSource/classifyMicCapture so the lobby self-test measures the SAME path the call publishes. B2c sweep does NOT run in lobby (pre-publish, no sender) → B5 is a distinct surface.

## Accepted: Batch-5 — STATUS: PASS (projcore gate)
HEAD: 2c062ff · Branch: feat/meet-diagnostics-audio-20260529
Implemented: device self-test fidelity (R8). ROOT CAUSE corrected from the brief's hypothesis: acquire parity ALREADY held post-B2a (preflight/reacquire/replaceAudioTrack all → audioCaptureConstraints w/ same selectedAudioId) — the false pass was a SIGNAL/CLASSIFICATION divergence, not acquire. Fix: the lobby meter (single-frame RMS×3) is no longer the verdict; a new pure accumulateEnergyFrame (mic-energy.ts) feeds the EXISTING single AnalyserNode's per-frame energy (RAW RMS + running cumulative) into a bounded 24-sample (~3s) window in media.service.startMicLevel (getMicCaptureWindow(); reset in stopMicLevel; NO new AudioContext/analyser). room.page lobbySelfTestFlag + selectedAudioLabel + ~1s lobby poller (gated state==='lobby' + audioContextActivated + lobby-mic-on+live+enabled) runs the SAME classifyMicCapture + SAME nextMicWarningState + SAME 0.01 threshold as the in-call watchdog (no shadow copy) on a SEPARATE signal. Non-blocking flag "No sound detected from <device> — pick another" in BOTH lobby surfaces (lobby-preview + lobby device-dialog mode-gated); Join stays enabled. AC1 = deep-equal constraint-parity regression guard (U-8).
Req#s closed: R8 (logic VERIFIED; real-device fidelity = manual). B1+B2(a/b/c)+B5 now all logic-complete on 2c062ff.
Open in matrix: R4,R5 (B3 — diagnostics on/off + admin kill-switch, NEXT) · R6,R7 (B4) · R9 (B6).
Deploy: HELD — deploy B1+B2(a+b+c)+B5 TOGETHER after JROM's ONE manual USER-seat localhost:4700 pass (NS6).
⚠ OPEN DECISION for projcore (flagged in callbacks.md B5 DONE): residual false-pass edge on a DITHERING dead mic — lobby uses 8-bit getByteTimeDomainData vs in-call float media-source totalAudioEnergy; truly-silent tracks (all-128 bytes) flag correctly, but DC-offset/dither could accrue >1e-7 over 24 frames ⇒ 'working'. Recommended threshold-preserving hardening: getByteTimeDomainData → getFloatTimeDomainData in startMicLevel (float-precision lobby energy, ×3 display recomputes trivially). Deviation from APPROVED-PLAN → projcore to choose: (A) fold into B5 now, (B) queue B5b, (C) accept as MANUAL-PENDING caveat. Lead leans (A).
Validation lesson: when a lobby/pre-publish surface must match an in-call RTCStats signal, watch the SOURCE precision — an 8-bit AnalyserNode is coarser than the float getStats path; the shared classifier/threshold is necessary but the energy SOURCE must also be comparable for true fidelity.
For B3 (R4/R5): localStorage flag meet-poc.diagnosticsLogging + diagnosticsLoggingEnabled signal already exist (room.page.ts ~181/2669) with NO UI — wire a real Settings toggle (default ON, persisted, gates client collect+upload). R5 global kill-switch reuses EXISTING admin module/auth (NS8 — NOT a new auth boundary; if it can't be done without touching auth → NEEDS-CLARIFICATION). Backend POST gate isAdmittedDiagnosticPoster (signaling/index.ts) + a config/me field so clients learn to stop.

## Accepted: Batch-5 — STATUS: PASS
HEAD: 2c062ff · Lobby self-test fidelity (R8). accumulateEnergyFrame reuses existing analyser meanSquare → ~3s window → classifyMicCapture → lobbySelfTestFlag (separate from in-call micSilentWarning); flag in lobby-preview + device-dialog, non-blocking. Constraint-parity regression test present.
Req closed: R8 (live flag = manual). Open: R4,R5 (B3 NEXT — diagnostics on/off + admin kill-switch), R6,R7 (B4), R9 (B6).
For B3: localStorage flag meet-poc.diagnosticsLogging + diagnosticsLoggingEnabled signal exist (room.page.ts ~181/2669) w/ no UI. Settings page = frontend/src/app/pages/settings/. Backend diagnostics POST gate = sessions/index.ts + isAdmittedDiagnosticPoster (signaling). Admin module exists (admin.guard, pages/admin). Reuse existing admin auth — NO new boundary (NS8).

## Accepted: Batch-3 (a+b) — STATUS: PASS
HEAD: 2c36c86 · R4 user toggle (diagnostics-prefs.ts shared) + R5 global kill-switch (migration 0012 app_settings; admin GET/PUT under requireAdmin scoped; sessions POST gate; /api/me diagnosticsGloballyEnabled; client computeEffectiveDiagnosticsEnabled AND-gate fail-open). B3 COMPLETE.
Req closed: R4, R5 (live @manual). Open: R6,R7 (B4 NEXT), R9 (B6).
DEPLOY: B3 NOT yet deployed — batching B3+B4+B6 into the final deploy (deployed build still at 2c062ff = B1+B2+B5). Migration 0012 will auto-run on next backend restart.
For B4: diagnostics rows in meeting_session_diagnostics (owner_email=host_email always; payload has clientId/clientName/participantId + sfuDiagnostics.inboundTracks{publisherClientId,bytesReceived,packetsReceived,concealedSamples}). R6=guest upload reliability + per-participant attribution/queryability. R7=surface per-publisher inbound audio health (flag near-zero bytes + high concealment) in the diagnostics VIEW (frontend/src/app/pages/diagnostics/). isAdmittedDiagnosticPoster in signaling/index.ts.

## RUN COMPLETE
HEAD 909bec6 deployed. All R1-R10 VERIFIED. Decisions logged: NS9 (greenlight), NS10 (self-test), NS11 (multi-device), NS12 (gate relax — JROM-approved security boundary). Manual USER-seat closure list handed to JROM.
