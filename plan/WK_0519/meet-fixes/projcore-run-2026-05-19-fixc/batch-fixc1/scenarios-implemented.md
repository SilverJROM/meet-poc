# FIXC1 Scenarios Implemented

| Scenario | Status | Evidence |
|---|---|---|
| Join with camera and leave stops all local tracks | PASS | `FIXC1.1` in `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts` |
| `pagehide` stops camera, mic, and active screen-share tracks | PASS | `FIXC1.2` in `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts` |
| Cleanup is idempotent across repeated lifecycle events | PASS | `FIXC1.3` in `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts` |
| Mute disables audio without stopping the track | PASS | `FIXC1.4` in `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts` |

R-C-3 is covered at the browser track lifecycle level. Camera LED proof remains a JROM hardware smoke.
