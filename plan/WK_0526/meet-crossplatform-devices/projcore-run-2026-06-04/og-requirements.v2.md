# og-requirements.md — meet-crossplatform-devices (CONTRACT, from converged findings R1-R6)

GOAL (JROM locked): UNIVERSAL — any device with mic+speaker+browser (PC/phone/iOS/Android/Linux) gets TWO-WAY AUDIO at minimum; camera optional (video only if a cam exists). Like Zoom/Meet. No stiffness, minimal permissions, fresh-browser friendly. Source: findings.md A1-A14, B1-B7, C1-C4, D1-D3.

## ARCH-0 (unifying principle, residual-risk from R5) — ONE robust media path
All capture/acquire/publish/subscribe flows through a SINGLE robust module, NOT per-button patches. Lobby and in-call use the SAME acquisition+fallback logic. This is both the correctness fix and the lean/modularity target.

## R1 — Resilient device acquisition (never fail to open on a valid device)  [A1,A2,A3,A4,A8,A9,A10,A11,A12,D2,D3]
1. Shared acquire helper with deviceId FALLBACK LADDER: selected {exact} → retry {ideal} → retry default(no deviceId) → (video) give up gracefully (audio unaffected). Camera AND mic, ALL paths.
2. Acquire-before-destroy: never stop the working track until the replacement is acquired.
3. Mic-first, camera-separate: request mic INDEPENDENTLY (must-succeed for audio); camera in a SEPARATE best-effort call — camera failure NEVER blocks/poisons audio (incl. first-run).
4. Persist device id ONLY after successful acquisition; rollback/clear stale id on failure; clear videoDevicePinned when stored cam missing.
5. Mobile: looser video constraints (ideal, not mandatory max).
6. Normalize OverconstrainedError/NotFoundError to explicit codes driving fallback + stale-id clear.
7. First-run permission copy = mic-first, camera optional.

## R2 — Listen-only / cameraless join (universal minimum)  [A5,B3]
1. May JOIN with no camera AND even no working mic (listen-only/muted) — never hard-blocked; warn two-way needs mic, but let them in to HEAR.
2. Later mic-enable: first real audio track registered+announced+sfu-published (not just sender-replaced) so remotes receive it.

## R3 — SFU publish/subscribe for ANY track (not just screen)  [A6,B4,B5]
1. Mid-call camera/mic enable registers/announces the new track so remotes subscribe.
2. Subscribers partial-subscribe ANY new untracked trackName (audio/video), not only screen.
3. Subscribe-stuck watchdog: teardown guard + bounded retry (not just log).

## R4 — Transport resilience (cross-network + reconnect)  [B1,B2,B7,C2]
1. ICE/connection-state recovery: on failed/disconnected → ICE-restart if supported else republish CF session + reannounce tracks.
2. Reconnect republish: bounded retry+backoff; reannounce after success.
3. ice-config fetch failure not silently STUN-only — retry/surface "relay unavailable"; force-relay retry path. (TURN verified live.)

## R5 — Mobile lifecycle  [C1]
1. Distinguish real unload from lifecycle freeze/background; background = pause/resume, not full cleanupCall.

## R6 — Playback/output robustness  [C3,C4]
1. Failed selected-speaker setSinkId() must NOT block playback: catch → default output → clear bad id → play. Persist output id only after success.

## R7 — First-run / protected-room flow  [D1]
1. Protected-room guest gets the password prompt before/at name entry, not a late signaling failure.

## R8 — Diagnostics visibility
1. Capture platform/userAgent + selected/active device ids + last getUserMedia error name (idempotent migration, gated by diagnostics toggle).

## R9 — Lean/modularity (focused, end)
1. Consolidate into the ARCH-0 media module; remove dead/dup device code; re-test audio playout/watchdog, mic-persist, camera-in-call, feedback limiter still work.

## Out of scope
SFU/transport beyond listed recovery; unrelated UI. mic-join-gate REVISITED by R2 (allow listen-only). No new auto-mute.

## Proof discipline (LESSON — 2 prior premature VERIFIEDs)
Fake-media e2e CANNOT reproduce OverconstrainedError/NotFound/real-permission → NOT proof for R1/R2/R3. Proof = unit tests on pure fallback/decision logic + full code review of unified path + no-regression specs. REAL devices (Android, PC-external, iOS) two-way audio = JROM seat. Do NOT mark R1/R2/R3 VERIFIED-for-real on e2e alone.
