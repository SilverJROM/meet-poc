# Batch-21d Changes

## Branch: `feat/crossplatform-devices-20260604`

Cut from `c417f1f`.

## User Report

"ERR6 re-arm the lobby mic self-test on ANY successful unlockAudioFromGesture while in lobby, not only on the explicit enableMicPreview tap, with a dup-poller guard; ERR7 add platform, userAgent, selectedAudioDeviceId, selectedVideoDeviceId, and lastGumError fields to buildDiagnosticsPayload plus the DiagnosticsPayload type in meeting-sessions.service.ts, additive only and no secrets."

## Root Cause

ERR6: `unlockAudioFromGesture()` activated mic preview audio but never re-armed the lobby self-test poller, so mobile users who unlocked audio through another lobby gesture could keep an empty/stopped self-test until the explicit enable-preview tap.

ERR7: `buildDiagnosticsPayload()` only emitted transport/session diagnostics and did not serialize platform, user agent, selected device IDs, or the last normalized media acquisition error.

## Code Changes

- `frontend/src/app/pages/room/room-decisions.ts` — Added `shouldRearmLobbySelfTest()` as a pure guard for lobby/audio-activated/not-running decisions.
- `frontend/src/app/pages/room/room-decisions.spec.ts` — Covered ERR6 re-arm, duplicate-poller, not-activated, and non-lobby cases.
- `frontend/src/app/pages/room/room.page.ts` — Re-arms the existing lobby self-test after successful audio unlock when still in lobby, records last normalized media acquire errors from existing failure paths, and additively includes platform/device/error fields in diagnostics payloads.
- `frontend/src/app/services/meeting-sessions.service.ts` — Added optional diagnostics payload fields for platform, user agent, selected device IDs, and last gUM error.

## Commits

- Not committed; projcore validates and commits.

## Standing Rules

- The lobby self-test poller lifecycle remains owned by `startLobbySelfTest()` / `stopLobbySelfTest()`; new triggers must use the existing timer guard instead of starting intervals directly.
- Diagnostics payload additions must be additive and must not remove or rename B16 ICE fields.

## Verification

- Focused spec: PASS (`npx tsx frontend/src/app/pages/room/room-decisions.spec.ts`)
- Frontend build: PASS (`cd frontend && npx ng build`)
- Whitespace check: PASS (`git diff --check -- frontend/src/app/pages/room/room.page.ts frontend/src/app/pages/room/room-decisions.ts frontend/src/app/pages/room/room-decisions.spec.ts frontend/src/app/services/meeting-sessions.service.ts`)
- DEV deploy: PASS (`pm2 restart meet-poc-fe`)
- Smoke verify: PASS (`curl -fsSI http://localhost:4700/login` returned `HTTP/1.1 200 OK`)

## Bug Reproductions

- ERR6 mechanism reproduced by code inspection: `unlockAudioFromGesture()` awaited `media.activateMicPreview()` but had no call path to `startLobbySelfTest()`; only explicit `enableMicPreview()` did.
- ERR7 mechanism reproduced by code inspection: `buildDiagnosticsPayload()` had B16 ICE and SFU fields but no platform, user agent, selected device IDs, or last gUM error fields.
- After fix: verified by pure decision spec, TypeScript/Angular build, and structural diff.

## Caveats

- PRE-EXISTING: Real mobile dead-mic flagging and real cross-device diagnostics capture need JROM/projcore validation on physical devices because headless fake media cannot prove platform audio unlock behavior.
