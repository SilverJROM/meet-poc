Batch-21d: Diagnostics — lobby self-test re-arm on gesture + richer diagnostics payload (ERR6/ERR7)

Batch ID: batch-21d
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B21c committed @ c417f1f). Do NOT commit (projcore validates + commits).
Read FIRST: north-star.md, findings.md (ERR6 line 137, ERR7 line 138).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): LOW. Confirm/counter at PROPOSED.

## projcore re-verified these are STILL OPEN (current sites below; confirm). This is the LAST build sub-batch of the tiny sweep.

## North-star tie-in
Observability for the universal goal: a mobile user whose mic is dead-but-permitted should still get flagged on the lobby self-test once audio unlocks (not only after an explicit "enable preview" tap), and diagnostics should capture enough device/platform context to debug a failed join on an unknown device.

## THE FINDINGS (confirmed OPEN by audit; current sites)
- **ERR6 (lobby self-test not re-armed on gesture)** — `frontend/src/app/pages/room/room.page.ts`: the lobby mic self-test poller (`startLobbySelfTest` ~3348, `pollLobbySelfTest`) effectively stops/stays-empty until the AudioContext is activated, and it is only (re)started via `enableMicPreview()` (~1075, an explicit user tap). `unlockAudioFromGesture()` (~2652) — which runs on other in-lobby gestures — does NOT re-arm the self-test. So on mobile, if the user interacts (unlocking audio) without tapping "enable preview", a dead/silent mic is never flagged. Fix: when `unlockAudioFromGesture` succeeds (audio context becomes activated) AND the user is in the lobby AND the self-test isn't already running/complete, (re)arm `startLobbySelfTest()` so the mic self-test runs once audio is unlocked by ANY gesture. Guard against duplicate/concurrent pollers (don't start a second one if one is active). Keep enableMicPreview's existing behavior.
- **ERR7 (diagnostics payload lacks device/platform context)** — room.page.ts `buildDiagnosticsPayload` (~3471): the payload has WS/SFU/ICE fields (incl. B16 requestedIceTransportPolicy) but NO `platform`, `userAgent`, `selectedAudioDeviceId`/`selectedVideoDeviceId`, or last getUserMedia error. So a failed join on an unknown device can't be diagnosed from the payload. Fix: add fields to the diagnostics payload: `platform` (mobile/ios/android/desktop via the existing PlatformService/viewport flags), `userAgent` (navigator.userAgent), `selectedAudioDeviceId` + `selectedVideoDeviceId` (current selected ids), and `lastGumError` (the last normalized getUserMedia/acquire error name/message if any — reuse the existing media error state if available, else null). Add the corresponding optional fields to the `DiagnosticsPayload` type in `frontend/src/app/services/meeting-sessions.service.ts`. Do NOT log secrets — userAgent + device ids + error name are fine; do not add tokens/credentials.

## Required fix (acceptance)
1. ERR6: a dead/silent mic is flagged by the lobby self-test once audio unlocks via ANY gesture (not only enableMicPreview), with no duplicate pollers.
2. ERR7: the diagnostics payload includes platform, userAgent, selectedAudioDeviceId, selectedVideoDeviceId, lastGumError; type updated; no secrets.
3. No regression: enableMicPreview self-test, the existing diagnostics consumers/schema (additive only), lobby device check, B16 diagnostics fields.

## Scope guards (MANDATORY — bypass mode)
- B21d ONLY (ERR6/ERR7). Touch: room.page.ts (ERR6 re-arm wiring + ERR7 payload fields), meeting-sessions.service.ts (DiagnosticsPayload type — additive optional fields). Plus tests if a pure seam helps.
- Do NOT touch: SFU/signaling/recorder/acquisition logic, the self-test DETECTION thresholds (only the re-arm trigger), B16 ice fields.
- Additive only for the payload (don't remove/rename existing fields). Robust assertions where there's a pure seam.

## Deterministic proof
- Unit spec (npx tsx) if a pure seam exists (e.g. a `shouldRearmLobbySelfTest({inLobby, audioActivated, alreadyRunning})` decision); otherwise reasoned + ng build for the payload/wiring.
- Re-run any diagnostics/room specs touched. `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real mobile dead-mic flag + real cross-device diagnostics capture is JROM's seat.

## Plan handshake (MANDATORY)
1. Read brief + room.page.ts (startLobbySelfTest ~3348, pollLobbySelfTest, enableMicPreview ~1075, unlockAudioFromGesture ~2652, buildDiagnosticsPayload ~3471) + meeting-sessions.service.ts DiagnosticsPayload type + PlatformService.
2. Reply PROPOSED: ERR6 re-arm trigger + dup-guard, ERR7 fields + type change, test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit.

## Artifacts (under <run-dir>/validation/B21d/)
scenarios.md, changes.md (Root Cause per finding + per-file WHY + honest note), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-21d <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
