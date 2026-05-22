# B7 Final Validation - Codex Independent Validator

Commit validated: `aabe71c62b3c2d474c57cf50efdb73493d62e5ab` (`feat/sfu-cutover`)

## Scope

Final re-validation of B7 after prior functional pass was blocked only by unbounded subscribe retry.

## Code Inspection

- `frontend/src/app/services/sfu-client.service.ts:61-62` adds `subscribeRetryAttempts: Map<string, number>` and `SUBSCRIBE_RETRY_CAP = 7`.
- `frontend/src/app/services/sfu-client.service.ts:86-96` increments the counter per `publisher.clientId`, applies exponential backoff (`250ms`, `500ms`, `1000ms`, `2000ms`, `4000ms` capped), and stops retrying once the cap is exceeded by leaving `subscribedClientIds` set.
- `frontend/src/app/services/sfu-client.service.ts:545-548` resets the publisher counter after successful `doSubscribe`.
- `frontend/src/app/services/sfu-client.service.ts:159-165` resets retry state and clears the subscribe guard when presence reports a new `cfSessionId` for an existing publisher.
- `frontend/src/app/services/sfu-client.service.ts:191-216` resets the counter in peer teardown.
- `frontend/src/app/services/sfu-client.service.ts:372-391` clears all retry state in `resetForReconnect`.
- `frontend/src/app/services/sfu-client.service.ts:424-440` clears all retry state in `destroy`.
- `frontend/src/app/services/sfu-client.service.ts:597-603` still treats CF `errorCode` responses such as `not_found_track_error` as retryable by throwing into the bounded retry path.
- `git diff aabe71c^ aabe71c -- frontend/src/app/services/webrtc.service.ts` returned no diff; mesh `webrtc.service.ts` is unchanged by this commit.

Note: the first retry delay is now 250ms as part of the exponential backoff, not a literal 100ms delay. The transient case remains covered by the bounded retry path and passed the requested SFU E2E runs.

## E2E Evidence

Command, run 1:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7g1.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: `4 passed (33.5s)`

- `B4a: two SFU clients each receive audio+video from the other through Cloudflare` passed.
- `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile` passed. This test asserts A returns to exactly `subscribedTracks === 2` after drop/reconnect and B also reaches `2`.
- `B7-exit: deliberate leave removes B tile from A immediately` passed. This test asserts A's subscribed track count reaches `0`.
- `B7-regression-B4a: two SFU clients each receive audio+video from the other` passed.

Command, run 2:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7g2.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

Result: `4 passed (42.5s)`

- `B4a: two SFU clients each receive audio+video from the other through Cloudflare` passed.
- `B7-drop: reconnect creates new CF session, A sees B again with no ghost tile` passed.
- `B7-exit: deliberate leave removes B tile from A immediately` passed.
- `B7-regression-B4a: two SFU clients each receive audio+video from the other` passed.

## Verdict

The previously unbounded subscribe retry is now bounded with per-publisher accounting, exponential backoff, terminal guard behavior, and reset paths for success/reconnect/teardown/reset/destroy. The transient subscribe-not-ready path remains functional under the requested E2E coverage. Mesh WebRTC service was not changed.

STATUS: VALIDATED-PASS
