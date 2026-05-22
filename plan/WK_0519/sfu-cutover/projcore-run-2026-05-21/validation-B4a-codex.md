# Validation B4a — SR-4 Subscribe Single Remote Publisher + Render

Validator: Codex independent validator  
Branch: `feat/sfu-cutover`  
Commit validated: `a9ab2847ab9da47f5a2bf29e8b43d2d30f255ea6` (`feat(sfu): subscribe to remote publishers + render tiles (SR-4, B4a)`)  
Date: 2026-05-21

## Scope Reviewed

- Requirement source: `plan/WK_0519/sfu-cutover/og-requirements.md`, SR-4.
- Commit diff reviewed with `git show a9ab284`.
- Files read directly:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `frontend/src/app/pages/room/room.page.html`
  - `e2e/tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts`
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B4a/changes.md`
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`

## Code Findings

PASS — `sfu-client.service.ts` subscribes to remote publisher tracks via `POST /api/sfu/tracks` with `location: 'remote'`, publisher `cfSessionId` as `sessionId`, and each publisher `trackName`.

PASS — the full Cloudflare subscribe renegotiation runs inside one serialized `enqueue()` operation: `subscribeIfNeeded()` enqueues `doSubscribe()`, and `doSubscribe()` performs `setRemoteDescription(offer)` -> `createAnswer()` -> `setLocalDescription(answer)` -> `PUT /api/sfu/renegotiate` without leaving that queued op.

PASS — CF response `{ trackName, mid }` is mapped back to the publisher through `SubscribedTrackEntry`, `midToEntry`, and `subscribedTracks`.

PASS — `pc.ontrack` is installed when the SFU peer connection is created, looks up the incoming `mid`, builds a per-publisher `MediaStream`, and publishes it through the `remoteStreams` signal.

PASS — self-subscribe and double-subscribe are guarded. Self is skipped by matching publisher `cfSessionId` against local publish state, and duplicate subscription is guarded by `subscribedClientIds`, marked before enqueue.

PASS — `room.page.ts` binds SFU remote streams to tile-compatible `PeerState` objects through `sfuPeers`, guarded by `isSfuMode` from `?sfu=1`. The subscribe effect only runs in SFU mode and waits for local publish state `published`, avoiding the roster-before-publish race described in `B4a/changes.md`.

PASS — `room.page.html` renders `sfuPeers()` only behind `isSfuMode()` and keeps the existing mesh `peers()` rendering in the `else` path.

PASS — mesh `frontend/src/app/services/webrtc.service.ts` is unchanged in `a9ab284` (`git diff a9ab284^ a9ab284 -- frontend/src/app/services/webrtc.service.ts` produced no diff).

PASS — commit scope is limited to expected B4a implementation/test/reporting surfaces:
`sfu-client.service.ts`, `room.page.ts`, `room.page.html`, `e2e/tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts`, and `callbacks.md`. `B4a/changes.md` exists as the expected run artifact in the workspace. No unrelated source/logic changes found.

## E2E Validation

Command run from repo root:

```bash
E2E_BACKEND_PORT=4822 \
E2E_FRONTEND_PORT=4823 \
E2E_PROXY_PORT=4821 \
E2E_BASE_URL=http://localhost:4821 \
E2E_WS_ORIGIN=ws://localhost:4821 \
MEET_DB_PATH=/tmp/meet-sfu-b4a-val.sqlite \
npm test -w e2e -- e2e/tests/sfu-b4a-subscribe/ --workers=1
```

Result:

```text
Running 1 test using 1 worker

✓  1 [chromium] › tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts:57:1 › B4a: two SFU clients each receive audio+video from the other through Cloudflare (6.1s)

1 passed (11.5s)
```

The spec asserts the core proof on both browser pages:

- inbound audio `inbound-rtp.packetsReceived > 0`
- inbound video `inbound-rtp.framesDecoded > 0`

## Conclusion

B4a satisfies SR-4 for the scoped proof: one remote publisher is subscribed through Cloudflare Realtime SFU, full renegotiation is serialized, remote tracks render through SFU-mode tiles, the mesh path remains unchanged, and the two-client e2e passes with inbound audio and video on both pages.

STATUS: VALIDATED-PASS
