# POSTFIX1 Codex55 Review

Scope reviewed:
- `git diff 427d1a7 HEAD -- frontend/src/app/services/sfu-client.service.ts frontend/src/app/services/sfu-mid-reconcile.ts frontend/src/app/services/recorder.service.ts frontend/src/app/pages/room/room-recording.ts`
- Current implementations of the four scoped files, plus the room subscribe effect and roster helper only where needed to validate reconnect/resubscribe mechanics.

## Findings

1. `frontend/src/app/services/sfu-client.service.ts:1523` / `frontend/src/app/services/sfu-client.service.ts:1125` - BLOCKING

Mechanism: `doSubscribeTracks()` applies the CF remote offer at line 1529, then several failure points can happen before a local answer is successfully set and committed: MID reconcile can throw at line 1537, `createAnswer()` can throw at line 1546, or `setLocalDescription(answer)` can throw at line 1547. The rollback path only calls `rollbackPendingLocalOffer()`, and that helper only rolls back when `signalingState === 'have-local-offer'`. After `setRemoteDescription(res.sessionDescription)` the peer connection is in `have-remote-offer`, so rollback is a no-op. The retry then runs against a PC stuck in a pending remote offer state, so future subscribe renegotiations can fail permanently and remote audio remains silent.

Suggested fix: replace `rollbackPendingLocalOffer()` with a signaling-state-aware rollback helper for subscribe transactions: use `setRemoteDescription({ type: 'rollback' })` for `have-remote-offer`, `setLocalDescription({ type: 'rollback' })` for `have-local-offer`, and fall back to full SFU transport reset if rollback fails or the transaction has already reached an unrollbackable stable-but-uncommitted state.

2. `frontend/src/app/services/sfu-client.service.ts:867` / `frontend/src/app/services/sfu-client.service.ts:873` - BLOCKING

Mechanism: `handleSfuPresence()` clears all subscription state immediately when `cfSessionId` changes, before it knows whether `applyPresenceUpdate()` will accept the new publisher record. The imported helper rejects updates with `update.revision <= existing.revision`; if a reconnect presence carries a reset/equal revision with a new `cfSessionId`, this path evicts `subscribedClientIds`, `midToEntry`, `subscribedTracks`, and streams, then leaves `remotePublishers` pointing at the old publisher object. Because the signal is not updated, the room subscribe effect does not re-run for the new CF session. Result: reconnect can evict audio/video and never resubscribe until some later roster/presence happens to repair it.

Suggested fix: treat `cfSessionId` changes as authoritative even when revision is not greater. Either make `applyPresenceUpdate()` accept a changed `cfSessionId` regardless of revision, or in `handleSfuPresence()` update `remotePublishers` directly after clearing reconnect state. Add a regression for same/lower revision plus changed `cfSessionId` proving `subscribeIfNeeded()` is re-triggered.

## Explicit Non-Findings

- `frontend/src/app/services/sfu-mid-reconcile.ts`: no audio-to-wrong-peer mapping found in the reviewed helper for the normal one-audio-track-per-publisher case. The helper scopes all reconciled entries to the publisher being subscribed and validates per receiver kind. The documented residual ambiguity remains same-receiver-kind video/screen ordering, not remote audio routing.
- `frontend/src/app/services/recorder.service.ts`: no remaining finalize-once blocker found across stop/discard/late-onstop/timeout in the reviewed paths. `discard()` resolves the pending stop promise, cleanup is guarded by `finalized`, and `start()` resets `stopInFlight`, `finalized`, and `pendingStopResolve` for session 2.
- `frontend/src/app/services/recorder.service.ts` / `frontend/src/app/pages/room/room-recording.ts`: no silent or mislabeled recording blocker found in the reviewed changes. Actual recorder MIME is propagated to blob/upload headers, and resumed peers are marked left/joined under the old/new client ids before stream sync.

STATUS: DONE
