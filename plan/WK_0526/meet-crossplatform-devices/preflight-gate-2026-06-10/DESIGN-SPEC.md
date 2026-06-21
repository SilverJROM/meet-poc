# DESIGN SPEC — Pre-join Device Gate (synthesized from sonnet+opus+haiku). Implementer = sonnet. Build on existing scaffolding.

## ROOT CAUSE (consensus): doPublish() never ran for Joanne (hasPc=false + publishStatus=null all samples). Silent because: the publish-after-admit path can be skipped/abort with NO error to joiner OR host, and "fully in-call" UI is shown on state==='in-call' WITHOUT confirming publish reached 'published'. Adjacent latent bug (haiku): a publish can "succeed" with an EMPTY audio transceiver (no live track) -> hasPc=true but no audio.

## BUILD ORDER (sonnet proposes exact batching in PROPOSED; each part has tests; tsc=0 + specs + ng build green)

### PART 1 — Robust publish + kill the silent never-publish (R3/R7) — THE core bug fix, highest priority
1. Gate "fully in-call" on localPublishState().status==='published', NOT just state==='in-call'. Add `preflightGateStatus` signal: pending|mic-fail|speaker-needed|ready|audio-connecting|audio-failed. While admitted-but-not-yet-published -> 'audio-connecting' UI ("Connecting your audio…"), controls reflect it.
2. Never-silent guards: room.page.ts:1777 `if (msg.participantId && msg.sessionId)` -> on missing, set 'audio-failed' + friendly banner (NOT skipped silently). Add .catch() on publishInitialSfuWithRetry. Handle the state-revert-before-publish race (haiku path) -> surface, don't silent-exit.
3. Verify published audio is REAL: after 'published', confirm a LIVE audio track with energy (reuse verifyInitialCaptureEnergy/B2a); if published-but-no-audio (empty transceiver) -> treat as audio-failed -> config panel.
4. Retries exhausted -> 'audio-failed' -> mandatory device-config panel + "Retry audio". retryPublishAudio() resets initialPublishRunId + re-runs publishInitialSfuWithRetry (pattern from republishSfuAfterTransportRecovery).
5. OBSERVABILITY: add `publishTriggerCount` (increment at TOP of publishInitialSfuWithRetry, before the guard ~room.page.ts:1555, independent of early-return) + persist `roomState` + publish phase in the diagnostics payload. (publishTriggerCount===0 => trigger never fired; >=1 => attempted.)

### PART 2 — The green-room GATE + device-config panel (R1/R2/R4/R5/R6)
6. Join HARD-blocked until: mic verified (existing lobbySelfTestFlag/classifyMicCapture shows real energy) AND speaker tested (speakerTestCount>0). Extend missingJoinPrereqs (room.page.ts:827). Mic+speaker mandatory; camera OPTIONAL (preview only if granted, never blocks).
7. DEVICE-CONFIG / TEST PANEL (R4): on ANY issue (mic-fail | speaker | audio-failed | user opens settings), show a Meet/Zoom-style panel: live MIC LEVEL meter, "Test speaker" tone button, CAMERA preview, device-switch <select> dropdowns (audioInput/audioOutput/videoInput via enumerateDevices), and "Confirm it's working" that RE-RUNS validation and only then unblocks. Friendly plain-language copy, NO jargon. Mobile-friendly (handle speaker-test autoplay-gesture).
8. Every gate step has a TIMEOUT + friendly escape; the connecting/confirm states must NEVER hang infinitely (bounded retry -> clear failure -> panel).

### PART 3 — Device-selection PERSISTENCE (R8) — fix mic-not-persisting
9. Root cause (consensus): selection dropped when selectedAudioId() is falsy (empty localStorage -> ensureSelectedAudioDevice/syncSelectedAudioIdToTrack early-return at ~room.page.ts:2374/2588) AND clobbered to '' on transient device fallback (~2422). Storage keys 'meet-poc.device.{audioInput,audioOutput,videoInput}'.
   FIX: (a) don't lose a valid selection on empty/failed storage read; (b) on transient fallback/reacquire, do NOT overwrite the user's stored preferred device with the fallback — keep the preference so it re-applies when the device returns; (c) persist mic/speaker/camera on EVERY explicit user selection (gate, config panel, in-call settings); (d) re-apply persisted selections on rejoin/reload/next-call.

## TESTS (mandatory — verifier!=fixer; projcore re-runs)
- Replay/unit: a publish-trigger-never-fires + a publish-succeeds-empty-transceiver + a state-revert-before-publish case -> all reach 'audio-failed' (never silent in-call). publishTriggerCount asserted.
- Gate: dead/silent mic -> Join blocked; speaker untested -> blocked; camera off -> NOT blocked.
- Config panel: switch mic via dropdown -> re-validate -> unblock.
- PERSISTENCE: select non-default mic -> reload/rejoin -> same mic selected + in use; same for speaker + camera (the R8 regression test).
- tsc --noEmit=0, the touched frontend specs via npx tsx, ng build green.

## UX BAR: Google Meet / Zoom green room. Calm, minimal, reassuring, mobile-first. No WebRTC jargon ever shown to the user.
