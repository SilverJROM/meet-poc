# Batch share-camera-cut Scenarios

## DR-53.1 Default camera suppression during active share
- Host and guest join with cameras enabled.
- Host starts screen share.
- Guest outbound camera sender is paused, guest tile shows avatar, and guest audio sender remains active.
- Host presenter sender is not paused because it carries the shared screen; share-main video remains visible.
- Presenter strip tile shows avatar instead of duplicating the shared screen as camera video.

## DR-53.2 Manual camera override during share
- While host share is active and guest camera is auto-suppressed, guest presses camera on.
- Guest outbound camera sender becomes active again and audio remains active.
- Override applies only to DR-53 auto-suppression.

## DR-53.3 Restore pre-share camera state
- When the active share ends, local camera state returns to the state captured when the share began.
- Camera-on before share returns on.
- Camera-off before share remains off, including the acknowledged edge where the user manually turned it on during the share.

