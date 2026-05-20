Batch-DIAGI: Fix camera/mic device switching (multi-device + mobile) (DR-25)

Batch ID: diagi
Requirement: DR-25 (full text in og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] diagi <STATE> <note>` to callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE:** never leave MEET_DB_PATH/MEET_RECORDINGS_DIR exported on a live pm2 restart; clean `pm2 start ecosystem.config.js`; verify no /tmp leak.

## DR-25 — Fix camera/mic device switching (multi-device + mobile)

JROM: "on the mobile device or machine with multiple camera's or mic selecting a new camera does not work, please allow this." Building on FIXC2's device dialog: selecting a different camera/mic in the picker must ACTUALLY switch the live stream.

Diagnose the real cause (don't guess — name it in PROPOSED): likely the chosen `deviceId` isn't passed into `getUserMedia({video:{deviceId:{exact:<id>}}})` / the new track isn't `replaceTrack`'d onto the senders, or the dropdown `change` handler isn't wired to the switch, or mobile uses `facingMode` (front/back) not deviceId.

Fix BOTH surfaces (pre-join lobby device dialog AND in-call gear dialog) and BOTH kinds (camera + mic). On mobile, support front/back camera switching. **Preserve the DR-13 audio-priority invariant** when the audio track is replaced (re-assert audio sender priority='high' after mic swap).

## Observed (confirm by reading)

- `frontend/src/app/components/device-dialog/device-dialog.component.{ts,html}` — the picker dropdowns + change handlers.
- `frontend/src/app/services/media.service.ts` — replaceVideoTrack/replaceAudioTrack, getUserMedia with deviceId/facingMode, device enumeration.
- `frontend/src/app/services/webrtc.service.ts` — replaceLocalSenderTrack + the DR-13 audio-priority re-assert.
- `frontend/src/app/pages/room/room.page.ts` — lobby + in-call dialog wiring; how the selected device flows to the stream.
- Existing mobile lobby spec `e2e/tests/v3-mb4-lobby/` (front/back camera) — extend/align.

## Scope

- DR-25 only — device switching actually applies.
- Do NOT regress FIXC2 (the dialog), DR-13 (audio-priority on mic swap), DR-11 (audio-only), DR-18/22 (reconnect/grace).
- Surgical to the device-selection → track-replace path.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: the ROOT-CAUSE diagnosis (exactly why selecting a device doesn't switch — deviceId not passed? change handler not wired? facingMode on mobile?), the fix for lobby + in-call + camera + mic + mobile front/back, how DR-13 audio-priority is preserved on mic swap, planned files, risks. Append callback. Wait for APPROVED-PLAN.

## Tests

- Playwright (fake multi-device — Chromium fake devices expose multiple if configured; otherwise assert the deviceId/track-replace path via debug hook): select a different camera in the lobby + in-call dialog → the published video track's deviceId/track id changes; same for mic; assert audio sender stays priority='high' after mic swap.
- Note in test-report: real multi-cam/mobile front-back is JROM's device confirm (fake devices can't fully prove hardware switching).

## Required artifacts at plan/.../batch-diagi/

changes.md (root-cause + per-file WHY), scenarios.md, review.md, test-report.md, screenshots/device-switch.png, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.

## Completion

COMMIT BEFORE STATUS: DONE + append the diagi DONE callback.
