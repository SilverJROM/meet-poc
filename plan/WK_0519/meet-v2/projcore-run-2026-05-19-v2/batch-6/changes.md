# v2-B6 Changes

## User Report

Invoke `$lead` for v2-B6. Implement the visual in-call overhaul: dynamic participant grid, per-tile mute/camera/host overlays, transient `media-state` signaling, and a meeting elapsed clock. Rebuild, restart live services, take a live comparison screenshot, and commit before `STATUS: DONE`.

## Root Cause Mechanism

The inherited call view used an unconstrained `auto-fit minmax(260px, 1fr)` grid and tiles that did not expose participant media state. That made the live meeting view feel stretched and visually unstructured, especially in the one-peer and two-peer states that JROM called out. B6 replaces the generic grid with count-specific layouts and makes each tile self-describing.

## Code Changes

- `backend/src/modules/signaling/index.ts`
  - Added admitted-only `media-state` relay.
  - Added `hostClientId` and per-peer `host` metadata on `admitted` payloads.
  - Kept the relay transient; no DB persistence or host gating.
- `frontend/src/app/services/ws.service.ts`
  - Extended WS message types for `hostClientId`, peer `host`, and `media-state`.
- `frontend/src/app/services/webrtc.service.ts`
  - Extended `PeerState` with `isHost`, `micEnabled`, and `camEnabled`.
  - Added `updatePeer()` for media-state mutations.
- `frontend/src/app/pages/room/*`
  - Added count-driven `.tiles-grid[data-count]` layout.
  - Added centered 1400px call panel and responsive fallbacks.
  - Broadcasts local mic/camera state on toggle and consumes remote `media-state`.
  - Tracks `hostClientId` and marks the host tile.
  - Added meeting elapsed clock with `m:ss` / `h:mm:ss` formatting and cleanup on leave.
- `frontend/src/app/components/tile/*`
  - Added camera-off initials avatar.
  - Added HOST badge, mute icon, and bottom name/state overlay.
  - Added deterministic HSL avatar color by participant name.
- `backend/tests/signaling-media-state.test.ts`
  - Added owner + two admitted guests relay test.
- `e2e/tests/v2-b6-grid/*`
  - Added targeted grid, overlay, media-state, avatar, host badge, and clock coverage.
- `project_specs.md`
  - Documented B6 call layout, overlay, media-state, and clock behavior.

## Grid CSS Approach

The grid is driven by `peers().length` on the call page:

| Count | Layout |
|---|---|
| 1 | centered tile capped at 720px |
| 2 | two equal columns |
| 3-4 | two-column 2x2 structure |
| 5-9 | three-column 3x3 structure |
| 10-12 fallback | three columns with vertical overflow |

The call panel is centered with `max-width: 1400px`; tablet and mobile media queries collapse higher-count states to two columns or one column respectively.

## Media-State Protocol Summary

Client sends:

`{ type: 'media-state', mic: boolean, cam: boolean }`

Server relays to other admitted peers only:

`{ type: 'media-state', clientId, mic, cam }`

No sender echo is sent. The local peer is updated directly from `MediaService` when the user toggles mic or camera.

## Autonomous Decisions

- Logged `decisions/2026-05-19-v2-b6-host-identity-protocol.md`: use additive `hostClientId` plus peer `host` flags on admitted payloads.
- Logged `decisions/2026-05-19-v2-b6-avatar-color-hash.md`: deterministic HSL from participant name hash for camera-off avatars.
- Logged `decisions/2026-05-19-v2-b6-clock-format.md`: local elapsed clock starts at admission and formats `m:ss` under one hour.
- Logged `decisions/2026-05-19-v2-b6-backend-restart.md`: restarted backend as well as frontend because B6 changed WS protocol handling.

## Caveats

- `peer-joined` still treats new peers as non-host unless metadata is present; this is sufficient for B6 because the owner is already known through `hostClientId`/admitted peers.
- Recording controls remain unchanged; B7 owns admin-only recording visibility and recording banner behavior.
- Participant sidebar, active speaker, and host removal controls remain B8 scope.
