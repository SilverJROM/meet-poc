# B7 Iter2 Independent Validation - Codex

Commit under validation: `d2a8b0e19a1dcc06720342f6d6c81e9398203e28`

Branch/worktree note: current `HEAD` is `c35a2d2` on `feat/sfu-cutover`; `d2a8b0e` is an ancestor and there are no later diffs in the validated source files:

- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/webrtc.service.ts`
- `e2e/tests/sfu-b7-reconnect/sfu-reconnect.spec.ts`
- `e2e/tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts`

## Code Inspection

### 1. Exit teardown and idempotency

PASS for code shape.

- `SfuClientService.closeLiveTracksForExit()` now closes the SFU `RTCPeerConnection` immediately, nulls the PC and senders, snapshots `localPublishState` and `callerCreds`, then clears `callerCreds` and `localPublishState`.
- The close PUT uses the snapshotted `creds` and `publishState`, so clearing service state before the async HTTP subscribe does not invalidate the request body.
- A later second call sees `localPublishState === null` / `callerCreds === null` and returns without a second close PUT or double-close crash.
- `RoomPage.ngOnDestroy()` now calls `cleanupCall()` before `sfuClient.destroy()`, preserving creds/state for `closeLiveTracksForExit()` when the PUT is fired.

Relevant refs:

- `frontend/src/app/services/sfu-client.service.ts:363-390`
- `frontend/src/app/services/sfu-client.service.ts:393-409`
- `frontend/src/app/pages/room/room.page.ts:937-945`
- `frontend/src/app/pages/room/room.page.ts:1500-1508`

### 2. Subscribe retry signal

PARTIAL in code, FAIL in runtime validation.

- `subscribeRetryVersion` signal exists.
- `subscribeIfNeeded()` catches the enqueued subscribe failure, clears `subscribedClientIds` for that publisher, and bumps `subscribeRetryVersion`.
- `RoomPage` reads `subscribeRetryVersion()` inside the SFU subscribe effect, so a bump is a reactive dependency and should re-run the roster pass.
- `doSubscribeTracks()` now throws when creds/publish/PC preconditions are missing instead of silently returning.

Relevant refs:

- `frontend/src/app/services/sfu-client.service.ts:48-49`
- `frontend/src/app/services/sfu-client.service.ts:75-90`
- `frontend/src/app/services/sfu-client.service.ts:517-525`
- `frontend/src/app/pages/room/room.page.ts:408-423`

Runtime validation does not confirm the required behavior. The B7 drop-reconnect test still times out with A's `subscribedTracks` stuck at `0` after B reconnects and republishes.

### 3. Mesh WebRTC service

PASS.

- `git diff --name-only d2a8b0e^ d2a8b0e -- frontend/src/app/services/webrtc.service.ts` returned no files.
- `git status --short -- frontend/src/app/services/webrtc.service.ts` returned clean.

## Test Command

Run 1:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7v2.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: FAIL, 3 passed / 1 failed.

- PASS: initial SFU subscribe regression.
- FAIL: `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile`.
- Failure: expected `subscribedTracks === 2`, received `0`, timeout after 180000 ms.
- PASS: `B7-exit: deliberate leave removes B tile from A immediately`, so exit-to-0 passed in this run.
- PASS: `B7-regression-B4a`.

Run 2, fresh DB path:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7v2-run2.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: FAIL, 3 passed / 1 failed.

- PASS: initial SFU subscribe regression.
- FAIL: `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile`.
- Failure: expected `subscribedTracks === 2`, received `0`, timeout after 180000 ms.
- PASS: `B7-exit: deliberate leave removes B tile from A immediately`, so exit-to-0 passed in this run.
- PASS: `B7-regression-B4a`.

Failure artifact from the last run:

- `e2e/test-results/sfu-b7-reconnect-sfu-recon-2757e--B-again-with-no-ghost-tile-chromium/error-context.md`
- `e2e/test-results/sfu-b7-reconnect-sfu-recon-2757e--B-again-with-no-ghost-tile-chromium/trace.zip`
- `e2e/test-results/sfu-b7-reconnect-sfu-recon-2757e--B-again-with-no-ghost-tile-chromium/test-failed-1.png`
- `e2e/test-results/sfu-b7-reconnect-sfu-recon-2757e--B-again-with-no-ghost-tile-chromium/test-failed-2.png`

## Verdict

The exit cleanup gap appears fixed by code inspection and both runs pass the exit-to-0 test. Mesh WebRTC remains unchanged.

The subscribe/reconnect gate is not fixed. Both requested runs fail the B7 drop-reconnect test at the required assertion: after reconnect, A never reaches `subscribedTracks === 2` and remains at `0`. This directly fails the requested confirmation that a peer known before/around publish completion will be subscribed without a permanent zero-track state.

STATUS: VALIDATED-FAIL
