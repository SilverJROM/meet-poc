# Validation: B6a SR-6 Part 1

Validator: Codex independent validator  
Date: 2026-05-22  
Commit under validation: `5524097909813a4fac54705bad399d583730e454` (`feat(sfu): publisher simulcast - camera video with h/m/l RID sendEncodings (SR-6, B6a)`)  
Branch: `feat/sfu-cutover`

## Scope Checked

- Reviewed `git show 5524097` and confirmed changed files are limited to:
  - `e2e/tests/sfu-b6a-simulcast/sfu-simulcast.spec.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/services/sfu-client.service.ts`
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`
- Confirmed `frontend/src/app/services/webrtc.service.ts` is unchanged by the commit.
- Confirmed there is no uncommitted diff in the checked source/test files. The worktree has unrelated pre-existing dirty plan/screenshot artifacts, left untouched.
- No source files were edited during validation.

## Code Findings

- PASS: `frontend/src/app/services/sfu-client.service.ts` defines camera simulcast encodings with three RIDs:
  - `h`: `scaleResolutionDownBy: 1`, `maxBitrate: 1_200_000`
  - `m`: `scaleResolutionDownBy: 2`, `maxBitrate: 400_000`
  - `l`: `scaleResolutionDownBy: 4`, `maxBitrate: 120_000`
- PASS: Camera-on publish path in `doPublish()` passes `sendEncodings: VIDEO_SIMULCAST_ENCODINGS` to `pc.addTransceiver(videoTrack, { direction: 'sendrecv', ... })`.
- PASS: Camera-off pre-negotiated publish path in `doPublish()` passes the same `sendEncodings: VIDEO_SIMULCAST_ENCODINGS` to `pc.addTransceiver('video', { direction: 'sendrecv', ... })`, so later `videoSender.replaceTrack(track)` inherits the configured sender encodings without renegotiation.
- PASS: `doReplaceVideoTrack()` still only calls `videoSender.replaceTrack(track)` and does not recreate the transceiver or overwrite sender parameters.
- PASS: Screenshare remains single-encoding. `doPublishScreen()` still calls `pc.addTransceiver(displayTrack, { direction: 'sendrecv' })` with no `sendEncodings`, so SR-6 part 1 is scoped to camera video only.
- PASS: Mesh `frontend/src/app/services/webrtc.service.ts` is unchanged.
- PASS: No unrelated source changes were found in the commit. The only non-SFU-client source change exposes `sfuVideoEncodings()` on `window.__meetDebug` for the e2e assertion.

## E2E Evidence

Command run from repo root:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b6a-val.sqlite npm test -w e2e -- tests/sfu-b6a-simulcast tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result:

```text
2 passed (22.9s)
```

The passing run includes:

- `tests/sfu-b4a-subscribe`: two SFU clients each receive audio+video from the other through Cloudflare.
- `tests/sfu-b6a-simulcast`: camera sender `getParameters().encodings` has three configured encodings with RIDs `h`, `m`, and `l`; at least one outbound video RTP stream is active; both clients receive inbound video frames from the other side.

## Simulcast Proof Assessment

This is sufficient evidence for B6a / SR-6 part 1 because the requirement is publisher-side simulcast configuration for camera video. The code configures all three RID encodings in both camera publish paths, and the browser-facing e2e assertion confirms `sender.getParameters().encodings` exposes those configured RIDs at runtime.

It is expected that only one outbound RTP layer may be active in headless Playwright/Chrome due to CPU, bandwidth, fake-media behavior, or Cloudflare/browser adaptation. B6a should therefore be judged on encodings being configured, not on all three layers being simultaneously active. Actual multi-layer forwarding behavior remains appropriate for B10/field validation.

STATUS: VALIDATED-PASS
