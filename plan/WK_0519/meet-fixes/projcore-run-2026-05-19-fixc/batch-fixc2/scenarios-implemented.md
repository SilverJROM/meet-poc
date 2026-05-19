# Batch FIXC2 Scenarios Implemented

## FIXC2.1 Pre-Join Modal Renders
- Visit `/join/:id?manualDeviceSetup=1`.
- Assert the custom permission-prep card appears before media tracks are acquired.
- Assert the Continue button is visible.
- Assert no live fake media tracks exist before Continue.

## FIXC2.2 Lobby Device Test Works
- Click Continue from the permission-prep card.
- Turn on the camera request.
- Assert the device dialog preview video renders real dimensions.
- Assert the mic VU fill updates from the analyser signal.
- Select the current mic and assert the persisted localStorage key is written.
- Click Test speaker and assert the debug speaker-test counter increments.
- Capture `screenshots/lobby-modal.png`.
- Re-enter the room and assert the persisted mic selection is restored.

## FIXC2.3 In-Call Gear Opens Dialog
- Join a room as host with camera on.
- Click the Device settings gear in the controls bar.
- Assert the reused dialog opens in in-call mode.
- Assert the speaker selector is present.
- Capture `screenshots/in-call-dialog.png`.

## FIXC2.4 Mic Swap Preserves Connection
- Join host and guest into the same room.
- Assert both peers reach `connected`.
- Open the in-call device dialog.
- Re-select the mic to trigger replacement.
- Assert the local audio track ID changes.
- Assert both peer connections remain `connected`.
