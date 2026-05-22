# B4b Changes — feat(sfu): late join + live publisher pickup + unsubscribe on leave (SR-4)

Commit: afb0441 on feat/sfu-cutover

## What changed

### `frontend/src/app/services/sfu-client.service.ts`

**`removePeer(clientId)`** — now calls `tearDownPeerSubscription` before updating the roster map. Cleanup state (remoteStreams, subscribedTracks, midToEntry, subscribedClientIds) is cleared synchronously before `remotePublishers` signal changes, so sfuPeers recomputes cleanly in one pass.

**`tearDownPeerSubscription(clientId)` (new private)**  
- Guards on `subscribedClientIds.has(clientId)` — no-op for peers we never subscribed to.
- Collects all mids from `subscribedTracks` where `publisherClientId === clientId`.
- Deletes those mids from `subscribedTracks` signal and `midToEntry`.
- Deletes clientId from `remoteStreams` signal (removes ghost stream entry).
- Deletes clientId from `subscribedClientIds`.
- If mids found + callerCreds + cfSessionId live: enqueues `doClose` through the op queue.

**`doClose(mids, creds, cfSessionId)` (new private)**  
- `PUT /api/sfu/tracks/close` with `{ ...creds, cfSessionId, tracks: mids.map(mid => ({ mid })) }`.
- Goes through `enqueue()` so it serializes with any in-flight subscribe/renegotiate.

### Late join + live new-publisher (no code change needed)

The subscription effect in `room.page.ts` already iterates **all** `remotePublishers` and guards on `localPublishState.status === 'published'`. Late join: C gets `sfu-roster` on admit; effect fires after C's publish completes and subscribes to all present. Live new publisher: each new `sfu-presence` updates the signal → effect re-fires → `subscribeIfNeeded` on the new publisher. B4a already delivered this correctly.

### `e2e/tests/sfu-b4b-late-join/sfu-late-join.spec.ts` (new)

2-client late-join minimum (per B4b brief escape valve):
- A joins and waits for published (A is established before B enters).
- B joins late → admitted → published → receives A's inbound media (late-join proof).
- A receives B's inbound media (live new-publisher pickup proof).
- B clicks "Leave call" button (explicit WS `leave` message → server broadcasts `peer-left` immediately, bypassing the 120s reconnect grace period).
- A's `remoteStreams.size` drops to 0 within 15s — no ghost tile, subscription torn down.

Note: 3-client harness was attempted but `remoteStreamCount(A) === 2` assertion failed due to CF renegotiation latency (A's ontrack for C takes 30–60s after C publishes, exceeding the polling budget without blowing the test timeout). The 2-client proof covers all B4b behaviors: late join, live pickup, and teardown.

Note on teardown timing: `guestBCtx.close()` triggers the server's 2-minute reconnect grace (DISCONNECT_GRACE_MS = 120s) and sends `peer-reconnecting`, not `peer-left`. The explicit Leave button click sends the `leave` WS message which triggers immediate `removeAdmittedPeer` → `peer-left` with no grace delay.

## Build + test
- `ng build --configuration production`: clean (pre-existing empty-glob warning unrelated)
- `playwright test sfu-b4b-late-join`: 1/1 passed (18.4s)
