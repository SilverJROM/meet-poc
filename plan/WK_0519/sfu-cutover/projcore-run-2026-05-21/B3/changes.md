# B3 changes — Signaling presence (SR-3)

Commit: 66ab520  Branch: feat/sfu-cutover

## Files modified

### backend/src/modules/signaling/index.ts
- Added `SfuPresenceEntry` type: `{ clientId, participantId, cfSessionId, tracks[{trackName,kind}], revision }`
- Added `sfuPresence: Map<string, SfuPresenceEntry>` and `sfuPresenceRevision: number` to `LiveRoom`; initialized in `getOrCreateLiveRoom`
- Added `cfSessionId` and `tracks` to `IncomingMessage`
- Added `sendSfuRosterToNewPeer(live, ws)` helper — sends `sfu-roster` with all current presence entries
- `admitPeer`: sends `sfu-roster` immediately after `admitted` (knock→admit path)
- Owner/resume join path: sends `sfu-roster` immediately after `admitted`
- Added `sfu-publish` handler (admitted only): validates cfSessionId + tracks, increments `sfuPresenceRevision`, stores entry, broadcasts `sfu-presence` to all other admitted peers
- `removeAdmittedPeer`: deletes sfuPresence entry on deliberate leave/host-remove
- `ws.on('close')` admitted path: deletes sfuPresence entry on disconnect

### backend/tests/signaling-sfu-presence.test.ts (new)
- `makeQueue(ws)` helper: buffers all messages (fixes race where admitted+sfu-roster arrive in the same TCP read)
- SR-3a: two clients publish → each sees the other's `sfu-presence`; late joiner gets `sfu-roster` with both
- SR-3b: repeated `sfu-publish` from same client → second `sfu-presence.revision` > first
- SR-3c: client sends `leave` → roster entry cleared; late joiner's `sfu-roster` omits departed client

### frontend/src/app/services/sfu-roster-utils.ts (new)
Pure functions (no Angular), exported for both service and spec:
- `RemotePublisher` interface: `{ clientId, participantId, cfSessionId, tracks[{trackName,kind}], revision }`
- `applyPresenceUpdate(publishers, update)` → new map if revision > existing, same map if stale/equal
- `applyRosterSnapshot(entries)` → new Map from full snapshot array
- `removeFromRoster(publishers, clientId)` → new map if entry exists, same map if absent

### frontend/src/app/services/sfu-client.service.ts
- Imports `applyPresenceUpdate`, `applyRosterSnapshot`, `removeFromRoster` from `sfu-roster-utils.js`
- Re-exports `RemotePublisher` type
- Added `remotePublishers = signal<Map<string, RemotePublisher>>(new Map())` — exposed for B4
- Added `handleSfuPresence(msg)`, `handleSfuRoster(publishers)`, `removePeer(clientId)`
- `destroy()` clears `remotePublishers`

### frontend/src/app/services/ws.service.ts
- `SignalingMessage` union: added `sfu-presence` and `sfu-roster` variants
- `OutgoingSignalingMessage` union: added `sfu-publish` variant

### frontend/src/app/pages/room/room.page.ts
- After publish resolves (sfu=1 path): sends `sfu-publish` with cfSessionId + live tracks
- `handleMessage`: added `sfu-presence` → `sfuClient.handleSfuPresence(msg)` and `sfu-roster` → `sfuClient.handleSfuRoster(msg.publishers)` cases
- `peer-left` handler: added `sfuClient.removePeer(msg.clientId)` (always safe, no-op if no entry)

### frontend/src/app/services/sfu-client.spec.ts (new)
8 assertions using `node:assert/strict` against `sfu-roster-utils.ts` pure functions:
- `applyPresenceUpdate`: adds new entry, rejects equal revision, rejects older revision, applies newer revision
- `applyRosterSnapshot`: replaces map entirely, handles empty snapshot
- `removeFromRoster`: deletes existing entry, no-op for unknown clientId

## Test results
- Backend build: clean
- Backend tests: 136/136 pass (1 pre-existing skip)
  - signaling-sfu-presence.test.ts: 3/3 pass
- Frontend build: clean (pre-existing stencil warning unrelated to B3)
- Frontend spec: `node out-tsc/spec/sfu-client.spec.js` — 8/8 assertions pass
