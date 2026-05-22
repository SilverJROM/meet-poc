# B6b Independent Validation - Codex

Date: 2026-05-22
Commit validated: `bc94bb2` (`12762c6` checked as callback/changes chore only)
Scope: SR-6 part 2, subscriber layer preference

## Result

STATUS: VALIDATED-FAIL

## Static Review

- `git diff --name-status bc94bb2^ bc94bb2` shows only:
  - `e2e/tests/sfu-b6b-layer-pref/sfu-layer-pref.spec.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/sfu-client.service.ts`
  - `plan/.../callbacks.md`
- `git diff --name-status bc94bb2..HEAD` shows only B6b plan/callback artifacts; no runtime source changed in `12762c6`.
- `frontend/src/app/services/webrtc.service.ts` is unchanged by `bc94bb2`.
- Current watched source files are clean vs HEAD:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/webrtc.service.ts`

## Requirement Checks

1. Subscribe request preferences: PASS
   - Desktop subscribe POST `/api/sfu/tracks` for remote camera carried:
     - `preferredRid: "h"`
     - `priorityOrdering: ["h", "m", "l"]`
     - `ridNotAvailable: "degrade"`
   - Mobile subscribe POST `/api/sfu/tracks` for remote camera carried:
     - `preferredRid: "l"`
     - `priorityOrdering: ["l", "m", "h"]`
     - `ridNotAvailable: "degrade"`
   - `preferredCameraRid()` uses `ViewportService.isMobile()` for mobile low / desktop high.
   - `cameraRidNow()` applies the screenshare-active low override through `isAnyScreenActive()`.

2. Camera-layer update: FAIL
   - `updateCameraLayer()` is enqueued and sends PUT `/api/sfu/tracks/update` for subscribed entries where `entry.kind === "video"`.
   - `room.page.ts` has an effect depending on `anyScreenShareActive()` and calls `sfuClient.updateCameraLayer()`.
   - Camera/screen distinction is mostly correct in the source: screen tracks are stored as `kind: "screen"` and camera tracks as `kind: "video"`.
   - Runtime failure: the B6b e2e trace shows the update PUT body sent `tracks: [{ mid: "", preferredRid: "h", priorityOrdering: ["h", "m", "l"], ridNotAvailable: "degrade" }]`.
   - Backend/CF response was `406 Not Acceptable`: `{"error":"tracks[0]: Missing mid in track","status":406}`.
   - Because the update uses an empty `mid`, the requirement to update camera mids is not satisfied.

3. Mesh service / unrelated changes: PASS
   - `frontend/src/app/services/webrtc.service.ts` is unchanged.
   - No unrelated runtime source changes found between `bc94bb2` and `12762c6`.

## Test Command

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b6b-val.sqlite npm test -w e2e -- tests/sfu-b6b-layer-pref tests/sfu-b4a-subscribe tests/sfu-b6a-simulcast --config=playwright.config.ts --workers=1
```

Result:

- PASS `tests/sfu-b4a-subscribe`
- PASS `tests/sfu-b6a-simulcast`
- FAIL `tests/sfu-b6b-layer-pref`

Failure:

- `page.evaluate(() => window.__meetDebug?.sfuUpdateCameraLayer?.())` threw `HttpErrorResponse`.
- Trace evidence is under `e2e/test-results/sfu-b6b-layer-pref-sfu-lay-31d1e-ile-update-preserves-stream-chromium/trace.zip`.
- The failing PUT request did carry `preferredRid: "h"` and `ridNotAvailable: "degrade"`, but it used `mid: ""`, causing the server rejection.

## CF Served-RID Limitation Judgment

The known CF/headless limitation around served RID stats is acceptable for B6b only if the request preferences and video-flow regression pass. Here the request-preference assertions for subscribe pass, but the update request fails with a rejected empty mid before the video-flow regression can complete. That is sufficient to fail B6b independently of served-RID observability.

STATUS: VALIDATED-FAIL
