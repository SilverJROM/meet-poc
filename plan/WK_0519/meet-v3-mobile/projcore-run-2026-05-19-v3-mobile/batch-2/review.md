# M-B2 Review

## Findings

No blocking findings.

## Review Checks

- Mobile cap is enforced in the WebSocket `join` message handler, not in the upgrade handler.
- Backend cap logic uses `Boolean(msg.mobile)` as truth.
- UA detection only logs `[mobile-cap-audit]` mismatch telemetry.
- Mobile cap check runs before the global 8-peer cap, so a 5th mobile joiner gets the specific mobile-cap error.
- Desktop join payload sends `mobile:false` and desktop constraints stay on the existing 1280x720 ideal path.
- Background-tab pause is mobile-only and installed only while in-call.
- Recording flow was not modified.
- No M-B3/M-B4/M-B5 future scope was implemented.

## Residual Risk

Background-tab handling is intentionally best-effort. The automated test proves behavior when `visibilitychange` fires, but iOS can still throttle background JavaScript and WebSocket delivery.
