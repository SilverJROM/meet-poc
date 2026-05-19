# M-B4 Decision — Lobby AudioContext Gate And FacingMode

## Decision

Gate AudioContext creation on mobile viewports only. Desktop continues auto-starting the mic analyzer to preserve the accepted Run 1 lobby behavior and regression suite.

## Rationale

The defect targeted by M-B4 is iOS/mobile autoplay policy: creating/resuming AudioContext during lobby mount can leave the context suspended. Gating mobile behind a visible user tap addresses that failure mode. Keeping desktop auto-start avoids a behavioral regression where desktop users would newly have to click a mic-preview pill.

## Pill Placement And Copy

The pill is rendered inside `<app-lobby-preview>` in the mic-meter row, using the copy `Tap to enable mic preview`. This keeps the action beside the meter it enables and makes the inactive state explicit.

## FacingMode And DeviceId

Mobile camera switch toggles `currentFacingMode` between `user` and `environment`. When `facingMode` is present, `MediaService.reacquire()` omits `deviceId`, because some browsers reject or ignore conflicting `deviceId` + `facingMode` constraints. The Playwright assertion targets `__meetDebug.lastVideoConstraints.video.facingMode`, not track IDs, because fake media does not reliably model real camera switching.

## Consequences

- Mobile lobby mic meters require one explicit tap before activity appears.
- Desktop lobby mic meters remain active after preflight.
- Mobile camera selector changes may be superseded by the current facing-mode preference while the flip control is in use.
