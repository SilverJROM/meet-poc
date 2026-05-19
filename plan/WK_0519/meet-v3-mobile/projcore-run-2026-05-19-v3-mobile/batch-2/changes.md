# M-B2 Changes

## User Report

Invoke `$lead` for M-B2, the high-risk Run 3 WebRTC mobile batch. Implement mobile 480p video constraints, client-declared `mobile: true` join payload, backend cap=4 in the join message handler, `isMobile` metadata on `PeerEntry`, best-effort mobile background-tab video pause, and full Run 1 desktop regression. Commit before `STATUS: DONE`.

## Code Changes

- `frontend/src/app/services/media.service.ts`
  - Injects `ViewportService`.
  - Adds `lastVideoConstraints` debug signal.
  - Uses mobile 480p constraints when `isMobile()` is true.
  - Preserves desktop 1280x720 ideal constraint path.
  - Reuses the same constraint branching for preflight, camera reacquire, and camera toggle.
- `frontend/src/app/services/ws.service.ts`
  - Adds optional `mobile` on outgoing `join`.
- `frontend/src/app/pages/room/room.page.ts`
  - Sends `mobile: this.viewport.isMobile()` on join.
  - Exposes `__meetDebug.lastVideoConstraints`.
  - Adds peer debug `micEnabled` / `camEnabled` so the second-context background-tab test can prove media-state propagation.
  - Adds mobile-only visibility listener while in-call; hidden disables local video and broadcasts `cam:false`, visible restores video if it was on and broadcasts `cam:true`.
- `backend/src/modules/signaling/index.ts`
  - Adds `isMobile` to `PeerEntry`.
  - Reads `Boolean(msg.mobile)` in the `join` handler.
  - Logs UA mismatch telemetry but trusts the client declaration.
  - Enforces mobile cap before global room cap.
- `backend/tests/signaling-mobile-cap.test.ts`
  - Adds backend coverage for the 4-mobile cap and the mobile/global cap stacking edge.
- `e2e/tests/v3-mb2-webrtc/*`
  - Adds mobile/desktop constraint checks, mobile cap rejection UI, mobile background-tab pause, and desktop-unaffected visibility behavior.

## WebRTC Constraints Table

| Context | Constraint |
|---|---|
| Mobile video | `{ width: { ideal: 854, max: 854 }, height: { ideal: 480, max: 480 } }` |
| Mobile audio-only | `{ audio: true, video: false }` |
| Desktop video | `{ width: { ideal: 1280 }, height: { ideal: 720 } }` |
| Desktop audio-only | `{ audio: true, video: false }` |

## Cap Enforcement

| Room state | Joiner | Result |
|---|---|---|
| 4 mobile admitted | mobile | `mobile room full (4 max)` |
| 4 mobile + 3 desktop admitted | mobile | `mobile room full (4 max)` |
| 4 mobile + 3 desktop admitted | desktop | admitted as 8th |
| 8 total admitted | any desktop joiner | `room full (max 8)` |

## UA vs Client Declaration

The backend trusts `msg.mobile` for cap enforcement. UA detection is kept only as an audit signal and logs mismatches at info level.

## Screenshots

- `screenshots/mobile-480p-constraint-debug.png`
- `screenshots/desktop-720p-constraint-debug.png`
- `screenshots/mobile-room-full-error.png`
