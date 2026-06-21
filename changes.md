# Ghost-Participant Fix (2026-06-21)

## Problem
Dropped participants lingered as fully-active ghosts for the full 2-min reconnect grace:
- Per-user MediaRecorder kept running → 7+ ghost recorders → renderer OOM (blocked R9)
- Dead SFU track subscriptions held open for 2 min per ghost
- Tiles showed phantom-active (no visual distinction from live participant)

## Root cause
`syncRecorderPeerStreams` treated `reconnecting: true` peers as ACTIVE — they stayed in
`activePeerIds`, so `removePeerStream` was never called. Ghost recorder ran until
`peer-left` (2 min later).

## Files changed

### frontend/src/app/pages/room/room-recording.ts
Skip reconnecting peers in `syncRecorderPeerStreams` (1-line change).
Reconnecting peer falls out of `activePeerIds` → `removePeerStream(clientId)` called →
per-user MediaRecorder stopped + AudioContext source node disconnected immediately.
_OOM fix._

### frontend/src/app/services/recorder.service.ts
Clear stopped per-user entry in `addStream` (2-line change).
Before `startPerUserRecorder`, check if existing entry has `stopped=true` and delete it.
Allows per-user recorder to restart fresh when peer rejoins and their SFU stream returns.
_Rejoin recorder restart fix._

### frontend/src/app/pages/room/room.page.ts
`sfuClient.removePeer` on `peer-reconnecting` (1-line addition).
Dead SFU track subscriptions torn down immediately on disconnect, not 2 min later.
On `peer-resumed`, existing code re-subscribes via SFU roster.
_SFU subscription churn fix._

### frontend/src/app/components/tile/tile.component.scss
Grey reconnecting tile (5 lines).
`[data-reconnecting="true"]` → opacity: 0.45; filter: grayscale(0.7); pointer-events: none.
Template already sets data-reconnecting and shows "Reconnecting…" label.
_Phantom-active tile fix._

### backend/src/modules/signaling/index.ts
Extend `remove-peer` to handle reconnecting peers (Case B, ~20 lines).
Previously `remove-peer` silently no-op'd if the target was in `live.reconnecting`.
Now:
1. Finds peer in `live.reconnecting`
2. Guards: owner cannot be kicked
3. `cleanupReconnectState` — cancels grace timer + DELETES reconnect token
4. Revokes durable identity (revoked: true) — rejoin cannot auto-reattach, must knock → host-admit
5. Broadcasts `peer-left` to all admitted peers
6. `promoteNextActingHost` / `maybeCloseEmptyRoom` (mirrors expireReconnectingPeer)

## Acceptance matrix

### Case A: drop → rejoin WITHIN grace (token valid)
- Drop → `startReconnectGrace` → `peer-reconnecting` broadcast
- Frontend: reconnecting:true → `syncRecorderPeerStreams` skips peer → `removePeerStream` → recorder STOPPED immediately
- `sfuClient.removePeer(clientId)` → dead SFU sub dropped
- Tile greyed (opacity 0.45, grayscale)
- Rejoin with valid token → `peer-resumed {oldClientId, clientId: newId}`
- `peer-resumed` handler: removes old ghost entry, inserts new live entry (reconnecting: false)
- `addStream`: clears stopped entry → fresh per-user recorder started
- Result: EXACTLY ONE participant, no duplicate, recorder restarted ✅

### Case B: drop → KICK (host) or grace EXPIRED (token invalidated)
**Grace expiry (expireReconnectingPeer, pre-existing):**
- `cleanupReconnectState` → token deleted; `peer-left` broadcast
- Recorder already stopped (via Case A flow); frontend removes ghost entry
- Rejoin: no token, identity not auto-admitted → knocks, host must admit ✅

**Host kick of dropped peer (NEW in this fix):**
- Host sends `remove-peer` with reconnecting peer's clientId
- Backend finds peer in `live.reconnecting` (was previously a silent no-op)
- `cleanupReconnectState` → cancels timer + DELETES token
- `clientIdentities.set(..., {revoked: true})` → identity revoked
- `peer-left` broadcast → frontend removes ghost immediately
- Rejoin: no valid token + revoked identity → `canResume=false`, `canAutoAdmitByIdentity=false`
  → knocks, waits for host Admit ✅
- Owner cannot be kicked (guard added)

### Unclean-drop (SIGKILL / network-kill — no clean WS close)
- Server WS ping every 20s; terminate after 2 missed pongs → `ws.terminate()` → `ws.on('close')`
- Max detection: ~40s
- After close: `startReconnectGrace` → `peer-reconnecting` → recorder STOPPED within ~40s ✅
- 40s << 2-min OOM window

## What did NOT change
- `startReconnectGrace` / token issuance / reconnect ticket lifetime
- `expireReconnectingPeer` (pre-existing grace-expire path)
- `peer-resumed` / `recordPeerResumed` / `sfuClient.removePeer(oldClientId)` on resume
- `peer-left` → `notifyParticipantLeft` → `removePeerStream` (safe no-op when already stopped)
- Normal recording start/stop
- Re-subscribe reconnect fix (B7)

## Deploy
- Frontend: npm run build → pm2 restart meet-poc-fe ✅
- Backend: tsc → pm2 restart meet-poc-be ✅
