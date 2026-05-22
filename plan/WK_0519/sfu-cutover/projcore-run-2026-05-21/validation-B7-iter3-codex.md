# B7 Iter3 Independent Validation - Codex

Date: 2026-05-22
Branch: `feat/sfu-cutover`
Validated HEAD: `d58d3ad` (`changes.md` chore)
Fix commit reviewed: `c8b6182` (`fix(sfu): retry subscribe on CF not_found_track_error + handle close renegotiation (B7 iter2)`)

## Scope

Independent re-validation only. No source edits made. This report file is the only intentional write.

## Code Review

### 1. CF `errorCode` / `not_found_track_error` detection

PASS.

`frontend/src/app/services/sfu-client.service.ts:579-587` reads `res.tracks ?? []`, scans the response tracks for any `errorCode`, and throws:

`throw new Error("[sfu] CF subscribe not ready: ...")`

This happens before `nextSubscribed` is created and before `subscribedTracks.set(...)`, so a failed CF subscribe is not treated as complete.

`subscribeIfNeeded()` at `frontend/src/app/services/sfu-client.service.ts:75-89` catches the rejected enqueue, deletes the `subscribedClientIds` guard for that publisher, and bumps `subscribeRetryVersion`. `room.page.ts:413-422` reads `subscribeRetryVersion()` inside the SFU subscribe effect, so the roster is re-evaluated and `subscribeIfNeeded()` can fire again.

It does not throw on the ordinary success path: if no response track has `errorCode`, execution continues into the renegotiation path or the no-renegotiation mid-mapping path.

### 2. Retry boundedness

FAIL.

I do not see a retry bound, attempt counter, elapsed-time ceiling, backoff cap, or terminal failure state for repeated subscribe failures. If CF keeps returning `errorCode`, the current flow is:

1. `doSubscribeTracks()` throws.
2. `subscribeIfNeeded().catch()` deletes the publisher guard.
3. `subscribeRetryVersion` increments.
4. The Angular effect re-runs and calls `subscribeIfNeeded()` again.

That is a functional retry, and it passed the live tests, but it is not bounded in source. It can continue indefinitely at the cadence of the failed HTTP round-trip and effect re-run.

### 3. `doClose` 400 handling and renegotiation

PASS with caveat.

`frontend/src/app/services/sfu-client.service.ts:249-273` now wraps `/api/sfu/tracks/close` in `try/catch`, so the known remote-subscriber 400 no longer breaks the queue. If CF returns a successful close response with `requiresImmediateRenegotiation` and `sessionDescription`, the method applies the remote offer, creates/sets a local answer, and sends `/api/sfu/renegotiate`.

Caveat: the catch is broad and silently swallows all close failures, not only the known remote-subscriber 400. For B7 this is acceptable because teardown had already removed local subscription state and the stated 400 is non-fatal.

### 4. Mesh `webrtc.service.ts`

PASS.

`git show --name-status c8b6182` shows only `frontend/src/app/services/sfu-client.service.ts` changed. `git diff -- frontend/src/app/services/webrtc.service.ts` is empty. Mesh WebRTC service is unchanged.

## E2E Evidence

Fresh DBs were removed before the runs.

Command run 1:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7f1.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: PASS, exit 0. `4 passed (30.9s)`.

Command run 2:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7f2.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: PASS, exit 0. `4 passed (30.2s)`.

The B7-drop spec explicitly asserts:

- B reconnects with a different `cfSessionId` than before the drop (`sfu-reconnect.spec.ts:104-118`).
- A reaches exactly `subscribedTracks === 2` after reconnect, not `0` and not ghost `4` (`sfu-reconnect.spec.ts:124-127`).
- B also reaches `subscribedTracks === 2` after re-publish/re-subscribe (`sfu-reconnect.spec.ts:129-130`).

Both required fresh-DB runs passed those assertions.

## Verdict

Runtime behavior is now reliably green across the two required fresh-DB runs, and the `not_found_track_error` detection/throw path is correctly wired to retry. However, the requested bounded-retry property is not present in source.

STATUS: VALIDATED-FAIL
