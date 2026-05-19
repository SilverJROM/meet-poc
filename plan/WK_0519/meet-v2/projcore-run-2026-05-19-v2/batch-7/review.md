# v2-B7 Self Review

Verdict: APPROVE.

The diff is scoped to B7 frontend surfaces: controls bar, recording banner, room-page recording/device state, frontend WS types, and B7 Playwright tests. Backend code was not changed.

Risk areas checked:

- Non-host Record button is not rendered in the DOM, not merely hidden.
- The host and guest banners use the same backend broadcast path.
- Recording stop order hides the banner without waiting for upload completion.
- Denied/no-device lobby states block Join; camera-denied/audio-ok is non-blocking.
- Mid-call microphone loss does not navigate or tear down the call.
- B5 stream carry-forward, B6 grid, and B3/B4 shell/tabs regressions still pass in the 32-test sweep.

Residual caveat:

- Mid-call device loss is best-effort browser behavior; real permission revocation events vary by browser. B7 wires both `onmute` and `onended`, which are the available local track signals.
