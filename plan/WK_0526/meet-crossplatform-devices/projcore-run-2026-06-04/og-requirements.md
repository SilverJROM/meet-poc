# og-requirements.md — meet-crossplatform-devices (FINAL CONTRACT, investigation locked R12)

GOAL (locked): UNIVERSAL like Zoom/Google Meet. ANY device with mic+speaker+browser (PC/phone/iOS/Android/Linux) gets TWO-WAY AUDIO at minimum; camera optional (video iff a cam exists). No stiffness, minimal permissions, fresh-browser friendly.
HANDBACK GATE (absolute): ZERO goal-blocking issues. Ant-size OK. Source detail: findings.md (~63 items, validated real).
PROOF DISCIPLINE: fake-media e2e CANNOT reproduce OverconstrainedError/NotFound/real-permission/real-network → NOT proof for P0 acquisition/transport. Proof = unit tests on pure decision/fallback logic + full code review of the unified path + no-regression specs + post-fix fan-out blocking-clean. Real-device (Android/PC-external/iOS/cameraless) = JROM final test.

## ARCH-0 — Unified, serialized media engine (KEYSTONE; build FIRST, route ALL paths through it)
One module owns capture acquire/replace/publish/subscribe; lobby AND in-call use the SAME logic; a single-flight serialized acquisition queue (META1) prevents concurrent-getUserMedia races. This is both the correctness fix and the lean target. Every P0 below is implemented IN this module, not per-button.

## P0 — GOAL-BLOCKING (must all be fixed for universal goal)
- P0.1 deviceId fallback ladder (A1 audio, A2 video): exact→ideal→default→(video)none; never exact-only. Persist id only after success; clear stale id. (+A10 normalize OverconstrainedError/NotFound to a code that drives this.)
- P0.2 Mic-first, camera-separate acquisition (A4, D2): request mic INDEPENDENTLY (must-succeed for audio); camera in a SEPARATE best-effort call; camera failure (Overconstrained/NotFound/in-use/denied) NEVER blocks or poisons audio. Lobby AND first-run.
- P0.3 Acquire-before-destroy (A3): never stop the working track until the replacement is live.
- P0.4 Cameraless + listen-only join (A5, B3): may join with no camera AND even no live mic (listen-only/muted, never hard-blocked; warn two-way needs mic). When mic enabled later, first audio track is registered+announced+sfu-published.
- P0.5 SFU announce + subscribe ANY track (A6, B3, B4): mid-call camera/mic enable registers/announces the new track; subscribers partial-subscribe ANY new trackName (not just screen); subscribe-stuck retry (B5).
- P0.6 PUB1 first-publish retry: bounded retry+backoff on publish failure; reannounce after success; surface rejoin if still failing (no silent stranded-unpublished).
- P0.7 LEAK1 meeting-ended teardown (+N1 host): on meeting-ended, full cleanupCall (stop media, close PC + AudioContexts, stop watchdogs) so camera/mic don't stay on.
- P0.8 B2 ICE/connection-state recovery: on failed/disconnected → ICE-restart else republish CF session + reannounce; C2 reconnect republish retry.
- P0.9 C1 mobile lifecycle: distinguish unload vs freeze (event.persisted, N3); background = pause/resume not full cleanup; pageshow re-entry.
- P0.10 Playback/sink fallback (C3, ERR1): failed setSinkId never aborts playout — catch per-element, fall back to default, clear bad id, keep playing; output id persisted only after success (C4).
- P0.11 ERR3 self-test on audio-only fallback path; ERR4 replaceAudioTrack rollback on publish-callback throw.
- P0.12 BK1 admit-stall: ownerHasJoined never resets if owner never returns → legit users blocked; derive host-elected state from membership / allow acting-host when no admitted owner.

## P1 — IMPORTANT (non-goal-blocking but real)
- B1 ice-config fetch fail loud/retry (TURN verified live); N2 hardcoded-STUN add turns:443 tcp fallback; B7 force-relay path.
- Leaks: LEAK2 recorder stale sources, LEAK3 active-speaker dup work, LEAK4 retry-timer cleanup, LEAK5 debug-track refs.
- Recording: REC1 ctx.resume (silent-on-mobile), REC2 dead-code eviction loop, REC3 peer-resumed recorder cleanup.
- BK2 removed-peer durable-identity revoke; SFU-S1 transactional subscribe rollback.

## P2 — ANT-SIZE (logged-to-fix, do not block handback)
- UX: UX1 guest back-link, UX2 chat Shift+Enter, UX3-15 (flash/h2/quality-pill/conn-state/copy/x-icons/aria), D1 protected-room password-before-join, R9-S1/2 mic-recovery error-specific copy, CMP1 camera/speaker [selected].
- Tiny: TINY2-7 (stale-closure/listener/handler races; TINY1 RETRACTED), ERR5-9, REC4-10, SFU-S2/3/S4, A8/A9/A11/A12, META trivia, active-speaker onstatechange.
- Hygiene/lean: TS1 setTimeout return types, TS2 stale sfu-client.spec, TS3 dead DatePipe import + dead/dup media code (lean pass).

## Build order: ARCH-0 → P0.1..P0.12 (atomic batches) → P1 → P2/lean → re-test prior fixes (audio-playout/watchdog, mic-persist, camera-in-call, feedback-limiter) → post-fix 3x regression fan-out (blocking-clean) → handback.
