# Batch FIXC2 Review

## Scope Review
- R-C-1 implemented with a styled pre-join device dialog before the browser permission prompt.
- R-C-2 implemented with an in-call gear button and the same dialog component.
- No transcript, screen-share layout, LLM, Ollama, or transcriber work was touched.

## Risk Review
- Existing lobby preflight tests require media acquisition on room load. The new dialog keeps that behavior by auto-starting preflight after a short delay, while FIXC2 tests use `manualDeviceSetup=1` to assert the explicit pre-permission step.
- Device replacement stops old tracks only after `replaceTrack()` completes, preserving FIXC1's media cleanup discipline.
- Speaker output selection is guarded by `setSinkId` support checks.
- The device dialog uses existing soft-light CSS variables and avoids introducing a separate visual theme.

## Verification Review
- Backend build and backend tests passed.
- Frontend build passed.
- Targeted FIXC2 e2e passed locally and against the public URL.
- Run 1 regression passed 49/49 after the implementation.
- Required lobby and in-call screenshots exist.
