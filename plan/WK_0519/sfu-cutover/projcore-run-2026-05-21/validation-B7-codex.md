# B7 Independent Validation - Codex

Date: 2026-05-22
Branch: feat/sfu-cutover
Commit validated: 0e31e5819d6212b854c61b4f10a711c84ad1a12b
Role: independent validator only; no source files edited.

## Scope

Validated B7 against SR-7: reconnect/leave/teardown over SFU.

Inputs reviewed:

- `git show 0e31e58`
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/pages/room/room.page.ts`
- commit file list / mesh WebRTC diff
- requested Playwright command, plus one exact rerun for flakiness check

## Code Inspection

PASS - Commit scope / unrelated changes

- `git show --name-status 0e31e58` shows only:
  - `A e2e/tests/sfu-b7-reconnect/sfu-reconnect.spec.ts`
  - `M frontend/src/app/pages/room/room.page.ts`
  - `M frontend/src/app/services/sfu-client.service.ts`
- `git diff 0e31e58^ 0e31e58 -- frontend/src/app/services/webrtc.service.ts` produced no entries.
- Mesh `webrtc.service.ts` is unchanged by the commit.

PASS - Drop reconnect reset ordering

- In `room.page.ts`, the `admitted` handler computes `wasInCall`, updates identity/session state, then calls `this.sfuClient.resetForReconnect()` at lines 1017-1019 before the awaited `for (const peer of msg.peers)` addPeer loop at lines 1020-1027.
- This matches the required ordering: an `sfu-roster` arriving during async yields in the addPeer loop will populate already-reset SFU state rather than being cleared after the loop.

PASS - Re-publish creates a new CF session path

- `resetForReconnect()` closes the old SFU `pc`, clears senders, credentials, subscribed client IDs, `midToEntry`, `opQueue`, local publish state, remote publishers/streams, screen streams, and subscribed tracks.
- After the addPeer loop, the admitted handler calls `this.sfuClient.publish(...)`; `doPublish()` creates a new `RTCPeerConnection` and posts `/api/sfu/session`, so a fresh `cfSessionId` is expected.

PASS - Old resumed peer SFU subscription teardown

- `peer-resumed` now calls `this.sfuClient.removePeer(msg.oldClientId)` before `webrtc.resumePeer(...)`.
- `removePeer()` calls `tearDownPeerSubscription(clientId)` and removes the old client from the SFU roster, which removes old subscribed mids and enqueues `/api/sfu/tracks/close` when possible.

PASS - Drop vs deliberate exit distinction

- Drop reconnect remains on the reconnect/admitted path and does not call `cleanupCall(sendLeaveMessage=true)`.
- Deliberate non-host leave still calls `directLeave(true)`, which calls `cleanupCall(true)` and sends `{ type: 'leave' }` before closing the WebSocket.
- Existing `peer-left` handling still calls both `webrtc.removePeer(msg.clientId)` and `sfuClient.removePeer(msg.clientId)`.

PARTIAL / RISK - Deliberate exit SFU PC teardown

- `cleanupCall()` calls `this.sfuClient.closeLiveTracksForExit()` before `this.ws.close()`.
- `closeLiveTracksForExit()` closes live published CF tracks with fire-and-forget `PUT /api/sfu/tracks/close`.
- However, `closeLiveTracksForExit()` does not close the SFU `RTCPeerConnection` itself. The SFU PC is closed only by `sfuClient.destroy()`, which is invoked from `ngOnDestroy()` after navigation.
- Because the requested check explicitly says `closeLiveTracksForExit() closes live tracks + PC`, this is not fully satisfied by the function as implemented.

NOT FULLY VALIDATED - DR-37/38/39 identity / no re-admit

- The source diff does not introduce a re-admit flow.
- The B7 drop test is intended to cover auto-reconnect with no host re-admit, but the test failed, so this cannot be accepted from runtime evidence.

## E2E Validation

Requested command run from repo root:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b7-val.sqlite npm test -w e2e -- tests/sfu-b7-reconnect tests/sfu-b4a-subscribe --config=playwright.config.ts --workers=1
```

First run result: FAIL - 2 failed, 2 passed.

- FAIL: `tests/sfu-b4a-subscribe/sfu-subscribe.spec.ts:57`
  - Timed out waiting for inbound audio packets.
  - Expected `packetsReceived > 0`; received `0`.
- FAIL: `tests/sfu-b7-reconnect/sfu-reconnect.spec.ts:98` (`B7-drop`)
  - The test got past the new `cfSessionId` and `published` checks.
  - It failed waiting for A's `subscribedTracks` to return to exactly `2` after reconnect.
  - Expected `2`; received `0` after 120s.
- PASS: `B7-exit`
  - A's subscribed tracks went to `0` after deliberate leave.
- PASS: `B7-regression-B4a`
  - Two SFU clients received media in both directions in that in-file regression.

Because B4a can be SFU/network-sensitive, I reran the exact requested command once.

Second exact run result: FAIL - 1 failed, 3 passed.

- PASS: standalone `tests/sfu-b4a-subscribe`
- FAIL: `tests/sfu-b7-reconnect/sfu-reconnect.spec.ts:98` (`B7-drop`)
  - This time it failed during initial `setupTwoClients()` before the simulated drop.
  - Expected initial A `subscribedTracks === 2`; received `0` after 90s.
- PASS: `B7-exit`
- PASS: `B7-regression-B4a`

Flakiness note:

- The standalone B4a miss on run 1 appears transient because it passed on the exact rerun.
- The B7 drop path failed on both full runs, though at different points: after reconnect on run 1 and initial setup on run 2. I cannot confirm the required drop reconnect invariant of exactly `2` subscribed tracks with no ghost / no double subscription.

## Verdict

The source changes mostly match the intended reconnect mechanics, and mesh WebRTC is unchanged. However, validation fails because:

1. The exact requested E2E command failed on both runs.
2. The B7 drop reconnect invariant could not be confirmed; run 1 reached a new `cfSessionId` and republished but A stayed at `subscribedTracks=0` instead of `2`.
3. `closeLiveTracksForExit()` does not itself close the SFU peer connection, despite the explicit check requiring live tracks + PC closure.

STATUS: VALIDATED-FAIL
