# SB3 Changes

User Report:
- SR4: adaptive simulcast subscriber video layer selection should respond to the SR3/SB2 connection-quality signal. Poor/degraded local links should subscribe to lower remote video layers and recover upward when quality improves.

Root Cause / Mechanism:
- The SFU client already published h/m/l simulcast layers and chose a preferred subscribed camera RID from local layout/device pressure, but the SB2 local connection-quality signal did not feed that subscribe-layer choice.
- In an SFU topology the subscriber should reduce inbound video pressure by requesting lower RIDs for remote video tracks when its own receive path is degraded.

Files Changed:
- `frontend/src/app/services/sfu-client.service.ts`
  - Added a sustained adaptive camera RID cap driven by `connectionQuality().band` and route.
  - Kept the existing mobile, screen-share, and subscribed-video-peer base RID rules intact.
  - Composed quality as a min-layer cap: poor => `l`, relayed fair/degraded => `l`, fair => max `m`, good/unknown => no cap.
  - Added 3-sample hysteresis before changing the active cap to avoid flapping.
  - Reuses existing `updateCameraLayer()` / `/api/sfu/tracks/update` to reapply changed RIDs to current live video subscriptions.
  - Left published simulcast encodings unchanged.

Verification:
- `cd frontend && npm run build` — PASS.

Notes:
- Focused spec assertions were not added because importing the Angular service directly into the existing Node-style spec triggers Angular JIT setup for `HttpClient`; the helper does not export cleanly into that spec harness without test-only Angular compiler bootstrapping.
