# B7 changes — Reconnect / leave / teardown over the SFU (SR-7)

Commits: 0e31e58 (iter1), TBD (iter2)

## iter2 — Gap fixes (B7-iter1.md corrections)

### Gap 1 — PC not closed on deliberate exit

**`closeLiveTracksForExit()` in `sfu-client.service.ts`:**
- Now closes `this.pc` + clears senders BEFORE firing the CF HTTP PUT.
- Made idempotent: snapshots `callerCreds` and `localPublishState`, then immediately clears both. A second call (e.g., ngOnDestroy after deliberate exit) sees null state and returns early — no double HTTP.
- `destroy()` already checks `if (this.pc)` so no double-close crash.

**`ngOnDestroy()` in `room.page.ts`:** Swapped order — `cleanupCall()` now runs BEFORE `sfuClient.destroy()`.
- Root cause of the test's alternating PASS/FAIL: `destroy()` was clearing `callerCreds` + `localPublishState` before `cleanupCall()` → `closeLiveTracksForExit()` could read them. CF sessions were never explicitly closed on page teardown (test fixture close, guestCtx.close()). After suite run 1 created 7 CF sessions, run 2 started with those sessions still active (within CF's 30s GC window), hitting what appears to be a CF concurrent-session limit and causing subscribe to fail.
- Fix: `cleanupCall()` first (reads valid state, fires HTTP, clears state), then `sfuClient.destroy()` (remaining cleanup, all idempotent).

### Gap 2 — subscribedTracks stuck at 0 (subscribe not retried on failure)

**`sfu-client.service.ts`:**
- Added `readonly subscribeRetryVersion = signal(0)` — public signal bumped on subscribe failure.
- `subscribeIfNeeded()`: attached `.catch()` to the enqueued `doSubscribe` — on failure, clears the `subscribedClientIds` guard for that publisher and bumps `subscribeRetryVersion`. This allows the subscription effect to retry for that publisher.
- `doSubscribeTracks()` precondition: changed from silent `return` to `throw` when `!creds || !publishState || publishState.status !== 'published' || !this.pc`. This ensures the catch in `subscribeIfNeeded` fires on precondition failure (e.g., subscribe called before publish was ready), clearing the guard and enabling retry.

**`room.page.ts` subscription effect:**
- Added `this.sfuClient.subscribeRetryVersion()` read as a reactive dep. When `doSubscribe` fails and bumps the version, the effect re-fires and re-evaluates the full roster. Combined with `localPublishState()` already being a dep, both scenarios are handled:
  1. Roster arrives before publish ready → publish transitions to 'published' → effect re-fires → subscribes.
  2. Subscribe call fails (CF error) → retry version bumps → effect re-fires → retries.

### e2e test updates

- `setupTwoClients` subscribe timeout: 90s → 120s (headless CF latency).
- Drop test ghost-check timeout: 120s → 180s; B re-subscribe: 90s → 120s.

### Test results (both runs confirmed non-flaky)

Run 1: B7-drop ✓ (8.8s), B7-exit ✓ (5.4s), B7-regression-B4a ✓ (8.6s) — 31.9s total  
Run 2: B7-drop ✓ (8.8s), B7-exit ✓ (6.1s), B7-regression-B4a ✓ (8.4s) — 34.8s total  
B4a: ✓ (6.7s)

The prior alternating PASS/FAIL was NOT pure CF latency — it was a deterministic stale-session accumulation bug fixed by the ngOnDestroy reorder.

## Files changed

### `frontend/src/app/services/sfu-client.service.ts`

**`resetForReconnect()` (new)** — called on the reconnecting client when `admitted` fires with `wasInCall=true`.
- Closes the old (dead) PC without any CF API calls — the old CF session is gone on a drop.
- Clears: `audioSender`, `videoSender`, `screenSender`, `callerCreds`, `subscribedClientIds`, `midToEntry`.
- Resets `opQueue = Promise.resolve()` so new ops don't wait for stale in-flight ops.
- Resets signals: `localPublishState(null)`, `remotePublishers(empty)`, `remoteStreams(empty)`, `remoteScreenStreams(empty)`, `subscribedTracks(empty)`.
- Ensures `subscribeIfNeeded` guards are clear so the subscription effect re-subscribes to the fresh sfu-roster after re-publish.

**`closeLiveTracksForExit()` (new)** — called from `cleanupCall()` on deliberate exit (fire-and-forget).
- Reads `localPublishState().tracks` for live-status tracks.
- Fires `PUT /api/sfu/tracks/close` for their mids (best-effort, swallows errors).
- CF 30s GC is the fallback if the request is cancelled by navigation.

### `frontend/src/app/pages/room/room.page.ts`

**`admitted` handler** — three changes:
1. `if (wasInCall && this.isSfuMode()) this.sfuClient.resetForReconnect()` moved to BEFORE the async `addPeer` loop.
   - **Root cause fix**: the `sfu-roster` message arrives from the server immediately after `admitted` and is processed during the loop's async yields (ws messages are dispatched via `void handleMessage(msg)` which doesn't serialize). If `resetForReconnect()` ran AFTER the loop, it would clear `remotePublishers` that the roster had just populated → B would see no publishers to subscribe to after re-publish.
   - By resetting BEFORE the loop, the roster populates `remotePublishers` into the already-reset state, and the subscribe effect fires correctly when publish completes.
2. Removed the old `if (wasInCall) this.sfuClient.resetForReconnect()` from the SFU block (replaced by #1).

**`peer-resumed` handler** — on `sfu-presence` update from reconnected peer:
- `if (this.isSfuMode()) this.sfuClient.removePeer(msg.oldClientId)` added BEFORE `webrtc.resumePeer(...)`.
- Tears down subscriptions to the old CF session and removes the old `remotePublishers` entry.
- New `sfu-presence` (from re-publish) arrives separately and triggers `subscribeIfNeeded` for the new session.
- Without this: old entry stays in `remotePublishers` alongside the new one → ghost tile + double subscription.

**`cleanupCall()`** — deliberate-exit SFU teardown:
- `if (this.isSfuMode()) this.sfuClient.closeLiveTracksForExit()` fires before `ws.close()`.
- Existing `leave` ws message → server `removeAdmittedPeer` → `peer-left` broadcast → others call `sfuClient.removePeer()` → card removed immediately.

### `e2e/tests/sfu-b7-reconnect/sfu-reconnect.spec.ts` (new)

Three tests, all PASS (25.1s):

- **B7-drop**: 2 clients (A host, B guest) established; trigger ws drop on B via `closeSignalingForTest()`; wait for B to get a NEW `cfSessionId` (proves `resetForReconnect` ran); assert A has exactly 2 `subscribedTracks` (not 4 = ghost); assert B has 2 subscribedTracks (re-subscribed to A).
- **B7-exit**: B clicks leave; assert A's subscribedTracks goes to 0.
- **B7-regression-B4a**: both clients receive `framesDecoded > 0`.

**Key test design note**: `sfuRemoteStreams.size` was not used as a readiness check because `ontrack` fires outside Angular's zone → the debug effect (which depends on zone events to run) doesn't reliably update `window.__meetDebug.sfuRemoteStreams`. Instead, `sfuSubscribedTracks()` (a function that reads the signal directly, set from zone-patched Promise chains) is the reliable ghost-check metric.

## Drop vs exit distinction (preserved)

| Scenario | Detection | CF side | Others |
|---|---|---|---|
| Drop | ws closes → `peer-reconnecting` → `peer-resumed` | New CF session; old GC'd in 30s | `removePeer(oldClientId)` + `sfu-presence` → re-subscribe |
| Deliberate exit | User clicks Leave → `leave` msg → `peer-left` | `closeLiveTracksForExit()` fire-and-forget | `peer-left` → `removePeer()` → card gone immediately |
