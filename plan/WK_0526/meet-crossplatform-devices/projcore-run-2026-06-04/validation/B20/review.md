# B20 Review

## Scope Check
- Touched only approved B20 implementation files plus one focused pure-decision helper/spec and B20 artifacts.
- Did not touch R9-S1/S2, SFU/signaling/recorder/transport, media acquisition, mic select, or relay-unavailable warning.
- Did not commit.

## Diff Review
- UX1 mirrors existing lobby back-link behavior for all three terminal panels.
- UX2 keeps the form submit path as-is while preventing only plain Enter through the keydown handler; Shift+Enter and IME composition return without `preventDefault()`.
- D1 uses dedicated bootstrap-captured `joinRoutePasswordRequired` and `joinRouteIsOwner` signals, avoiding reuse of in-call owner/host signaling state.
- CMP1 removes select-level `[value]` only from camera and speaker selects and adds per-option `[selected]`.

## Risks
- UX1/CMP1 are not browser-screenshot proven in this artifact set.
- Build warnings remain from unrelated existing issues: unused `DatePipe`, Ionic empty glob, and CommonJS MediaPipe dependency.
