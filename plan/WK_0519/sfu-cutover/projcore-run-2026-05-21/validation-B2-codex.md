# B2 independent validation — Codex

Date: 2026-05-21
Branch: `feat/sfu-cutover`
Commit validated: `97900bd feat(sfu): B2 SFU client publish path + operation queue (SR-2)`
Requirement: `plan/WK_0519/sfu-cutover/og-requirements.md` SR-2

## Scope reviewed

- `git show --stat --name-status --oneline 97900bd`
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `e2e/tests/sfu-b2-publish/sfu-publish.spec.ts`
- `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B2/changes.md`
- Confirmed `frontend/src/app/services/webrtc.service.ts` has no diff in `97900bd^..97900bd`.

## Static validation

PASS: `SfuClientService` creates a single service-owned `RTCPeerConnection` for the SFU publish leg and configures ICE with Cloudflare STUN first:

- `stun:stun.cloudflare.com:3478`
- existing `IceConfigService.getIceServers()` entries appended as TURN fallback

PASS: local media publish is shaped for SR-2:

- audio transceiver is `sendrecv` when an audio track exists, with an audio transceiver fallback when absent.
- video transceiver is always pre-negotiated as `sendrecv`; camera-off join uses `addTransceiver('video', { direction: 'sendrecv' })`.
- publish flow is `createOffer` -> `setLocalDescription` -> `POST /api/sfu/session` -> `POST /api/sfu/tracks` with `location:'local'` tracks and offer SDP -> `setRemoteDescription(answer)`.
- track names follow `{participantId}:{epoch}:{kind}:{uuid}`.
- local publish state persists `cfSessionId` plus per-track `{ trackName, kind, mid, status }`, giving later close/update code a mid-addressable model.

PASS: operation serialization is established:

- `enqueue<T>()` is the single promise-chain queue.
- `publish()` runs through `enqueue()`.
- all B2 PC SDP/transceiver mutations happen inside the queued `doPublish()` operation. Subscribe/update/close are not present in this batch and are expected to reuse the queue in later batches.

PASS: mesh path was not changed:

- `git diff 97900bd^ 97900bd -- frontend/src/app/services/webrtc.service.ts` produced no diff.
- `room.page.ts` changes are additive: service injection, debug exposure, teardown cleanup, and publish invocation gated by `?sfu=1`.
- Existing mesh signaling and `webrtc.configure(...)` remain in place for non-SFU/default flow.

PASS: no unrelated source/logic changes found in the commit:

- Changed files are limited to:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `e2e/tests/sfu-b2-publish/sfu-publish.spec.ts`

## E2E validation

The new Playwright spec genuinely drives the browser publish path:

- logs in through the app fixture
- creates a room through the API fixture
- navigates to the real room URL with `?sfu=1`
- uses Playwright fake media
- enables camera in the lobby to obtain audio and video tracks
- joins the room and waits for the call UI
- asserts `window.__meetDebug.sfuPublishState.cfSessionId` is truthy
- asserts publish state reaches `published`
- calls `window.__meetDebug.sfuGetStats()` and requires outbound RTP stats for both `audio` and `video`

No route interception or mocked `/api/sfu/*` path is present in the B2 spec. The frontend calls the backend SFU proxy, which calls Cloudflare Realtime using server-side credentials from the B1 proxy module.

## Commands run

PASS:

```bash
npm run build -w frontend
```

Result: build completed successfully. Angular emitted the pre-existing Stencil empty-glob warning only.

PASS:

```bash
E2E_BACKEND_PORT=4822 \
E2E_FRONTEND_PORT=4823 \
E2E_PROXY_PORT=4821 \
E2E_BASE_URL=http://localhost:4821 \
E2E_WS_ORIGIN=ws://localhost:4821 \
MEET_DB_PATH=/tmp/meet-sfu-b2-val.sqlite \
npm test -w e2e -- tests/sfu-b2-publish --config=playwright.config.ts --workers=1
```

Result: `1 passed (8.9s)`.

## Notes

- The repo working tree contains many pre-existing unrelated dirty plan/screenshot files. They are outside the B2 commit surface and were not treated as B2 changes.
- B2's persisted SFU track model is local/in-memory and minimal, as expected for SR-2 publish. Roster revision and remote publisher persistence remain future-batch concerns.

STATUS: VALIDATED-PASS
