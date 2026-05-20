# Decision: Device Targeting Mode

## Decision
Camera targeting is either exact `deviceId` or mobile `facingMode`, never both.

## Reason
Mobile browsers may reject or ignore conflicting constraints. The observed bug came from `facingMode` overriding picker-selected cameras.

## Consequence
- Picker selection pins an exact camera device.
- Front/back flip clears the pinned device and requests by `facingMode`.
- After flip, the user can still choose any listed camera from the picker to return to exact-device mode.

