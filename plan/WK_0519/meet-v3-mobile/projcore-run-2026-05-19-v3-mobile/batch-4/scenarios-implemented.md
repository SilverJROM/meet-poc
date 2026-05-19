# M-B4 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| S3.1 camera switch visible on mobile | PASS | `lobby-mobile.spec.ts`, `mobile-camera-switch-button.png` |
| S3.1 camera switch hidden on desktop | PASS | `lobby-mobile.spec.ts`, `desktop-lobby-no-switch.png` |
| S3.1 camera switch sends `facingMode` constraint | PASS | Playwright asserts `__meetDebug.lastVideoConstraints.video.facingMode === 'environment'` |
| S3.3 single-column mobile device selectors | PASS | Playwright selector bounding boxes + `mobile-selectors-single-column.png` |
| S3.4 mobile AudioContext gesture gate | PASS | Initial debug false + pill visible; click sets debug true and starts meter activity |
| R8.1 Run 1 desktop regression | PASS | 40/40 Playwright regression |
| M-B3 regression | PASS | 9/9 M-B3 Playwright regression |

## Deferred By Contract

R3.2 compact 5-bar mic meter remains deferred to v3.5. M-B4 keeps the existing 8-bar meter and only changes activation.
