# Batch share-camera-cut Changes

## User Report
> JROM: when someone is screen-sharing (a demo), cut all participants' CAMERA video so the shared content is the focus + data/CPU is freed (esp. phones). Implement: when ANY peer is screen-sharing, AUTO-SUPPRESS all participants' outbound CAMERA video (pause the camera sender -> data cut, show avatar), while the SCREEN-SHARE stream + ALL audio keep flowing (DR-34); the shared content is NOT suppressed. RESTORE each participant's camera to its PRE-share state when the share ends (on->on, off->off -- track pre-share state). Default=suppress (JROM "cut all") but manual camera-on during share still works (manual beats auto). Composes as the strongest video-off signal with cap5/DR-51/DR-42.

## Root Cause Mechanism
Screen-share state already propagated through `media-state.screenOn`, but camera state and outbound video policy did not treat an active share as a call-wide camera-suppression condition. Camera tiles could keep rendering participant camera video, and non-presenters kept sending camera RTP during someone else's presentation.

## Per-file WHY
- `frontend/src/app/services/webrtc.service.ts`: added a share-camera policy and folded it into outbound video pause decisions. Local presenters bypass pause so the sender carrying the screen-share track is never suppressed.
- `frontend/src/app/services/media.service.ts`: added a focused helper to enable/disable the local camera track without necessarily replacing the active sender, needed so local screen-share senders are not disturbed.
- `frontend/src/app/pages/room/room.page.ts`: detects any active share, captures pre-share camera state, suppresses/restores local camera state, broadcasts effective camera state, and supports a manual camera-on override during remote shares.
- `frontend/src/app/pages/room/room.page.html`: camera control now reflects effective camera state during share suppression.
- `frontend/src/app/components/tile/tile.component.ts`: presenter strip tiles render avatar while share-main keeps `forceVideo` for the screen stream.
- `e2e/tests/v3-share-camera-cut/share-camera-cut.spec.ts`: verifies default suppression, presenter exemption, avatar fallback, audio continuity, manual override, and restore.

## Autonomous decisions
None.

