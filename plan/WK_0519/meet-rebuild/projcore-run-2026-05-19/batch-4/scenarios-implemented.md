# Batch 4 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S4.1 guest lobby shows room title | PASS | `lobby.spec.ts` |
| S4.2 owner auto-admit | PASS | `owner-auto-admit.spec.ts`, `screenshots/call-view-one-peer.png` |
| S4.3 two-context P2P signaling | PASS | `two-context-p2p.spec.ts`, asserts 2 tiles and `connected` state both ways |
| S4.4 waiting-room admit/reject | PASS | `waiting-room.spec.ts`, `screenshots/lobby-knocking-state.png`, `screenshots/owner-waiting-room.png` |
| S4.5 mute/camera/screen controls | PASS | `controls.spec.ts`, page-evaluate media assertions |
| S4.6 leave returns to dashboard | PASS | `leave.spec.ts` |
| S4.7 room full shows inline error | PASS | `room-full.spec.ts`, 8 ephemeral owner WS clients |
| S4.8 six-peer warning | PASS | `peer-warning.spec.ts`, 5 ephemeral owner WS clients plus UI owner |

## Non-Regression

B4 keeps `/room/:id` unauthenticated and renders exactly one room state branch at a time. B3 S3.5 was rerun and passed with `.toHaveCount(0)` on post-auth login-form selectors.
