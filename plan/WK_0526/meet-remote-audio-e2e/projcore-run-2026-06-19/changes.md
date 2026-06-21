# Changes — stale subscription on publisher reconnect/republish

**Date:** 2026-06-20 (Manila)
**Branch:** feat/remote-audio-e2e-20260619
**Implementer:** sonnet (projcore batch)

---

## Problem

4-party SFU call: when a publisher reconnects (new `cfSessionId` + new audio `trackName`), existing subscribers receive `perTrackBytesDelta:0` / `energy:0` from that publisher. Host sees audio correctly (subscribed to live track); locals and remote agents go silent.

**Root cause — two failure modes:**

1. **Async-effect deferred re-subscribe**: `handleSfuPresence` calls `clearPublisherSubscriptionStateForRetry` on new `cfSessionId` (correct), then relies on an Angular `effect()` over `remotePublishers()` to call `subscribeIfNeeded`. The effect fires asynchronously and may not re-run if the signal value didn't reference-change. Result: locals never re-subscribe.

2. **In-flight POST binds dead track (Case 2)**: An old `doSubscribe(oldPublisher)` CF POST can still be in-flight when reconnect arrives. After `clearPublisherSubscriptionStateForRetry`, a new subscribe is enqueued. But the old POST completes first and binds the dead track into `remoteStreams` — `getAudioTracks()[0]` returns the stale 0-byte track before the new subscribe's live track lands.

---

## Fix

### 1. `frontend/src/app/services/sfu-client.service.ts` — `handleSfuPresence`

Added direct `subscribeIfNeeded` call on the reconnect path (after state clear), so re-subscribe is deterministic rather than deferred to the async effect:

```typescript
// Publisher reconnected (new cfSessionId): state was evicted by clearPublisherSubscriptionStateForRetry.
// Call subscribeIfNeeded directly so re-subscribe is deterministic — not deferred to the async effect.
// The effect's subscribeIfNeeded call will no-op (subscribedClientIds already set by this direct call).
if (!samePublisherSession && nowPublisher && nowPublisher.tracks.length > 0
    && this.localPublishState()?.status === 'published') {
  this.subscribeIfNeeded(nowPublisher);
}
```

Guard: `localPublishState()?.status === 'published'` — mirrors the Angular effect's existing publish-gate so we don't try to subscribe before we've joined CF ourselves.

### 2. `frontend/src/app/services/sfu-client.service.ts` — `doSubscribeTracks`

Stale-cfSession guard added after CF error check, before any mid/stream binding:

```typescript
const publisherCurrent = this.remotePublishers().get(publisher.clientId);
if (publisherCurrent && publisherCurrent.cfSessionId !== publisher.cfSessionId) {
  console.warn('[sfu] doSubscribeTracks: stale cfSession — aborting bind after in-flight reconnect', { ... });
  return;  // NOT throw — retry counters and subscribedClientIds must not be cleared
}
```

Return (not throw): the `subscribeIfNeeded.catch()` handler must not clear `subscribedClientIds` or increment retry counters. The new subscribe for the current cfSession is already enqueued; we just need the old response to be silently discarded.

Guard condition `publisherCurrent &&` (publisher still in roster): if the publisher left entirely, `tearDownPeerSubscription` already closed the CF side — no bind possible anyway.

---

## Tests

### `frontend/src/app/services/sfu-client.spec.ts`

**SFU-R3 (happy path — reconnect re-subscribe)**
- Seeds old cfSessionId/trackName as subscribed state
- Fires `handleSfuPresence` with new cfSessionId + new trackName
- Asserts: exactly 1 CF POST issued, POST carries new cfSessionId/trackName (not stale), stale mid evicted from `midToEntry` and `subscribedTracks`

**SFU-R4 (in-flight race guard)**
- Seeds roster with `new-cf` (publisher already reconnected)
- Calls `doSubscribeTracks(oldPublisher)` directly (CF POST returns a response binding old mid)
- Asserts: stale-session guard fires, dead mid NOT bound in `midToEntry`, `subscribedTracks`, or `remoteStreams`

Both pass. Exit code: 0.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/app/services/sfu-client.service.ts` | Fix 1: `handleSfuPresence` reconnect branch · Fix 2: `doSubscribeTracks` stale-cfSession guard |
| `frontend/src/app/services/sfu-client.spec.ts` | SFU-R3 + SFU-R4 regression tests |

No backend changes. Signaling already re-broadcasts presence on reconnect (`signaling/index.ts:1141-1143`).

---

## Deploy

- `npm run build` ✓ (no errors, two pre-existing warnings: `@mediapipe/selfie_segmentation` CommonJS + stencil glob)
- `pm2 restart meet-poc-fe` ✓ (online, pid fresh)
- Backend: not restarted (no backend change)

---

## Red-team (codex55, independent review)

Codex55 (`lkvc-codex55`) reviewed the actual git diff + read `sfu-client.service.ts`. Verdict: **FAIL — one real gap found**.

**Q1 — double-subscribe?** PASS. `subscribedClientIds.add()` at line 173 is before `enqueue()` at 175 — optimistic mark. Angular effect call no-ops.

**Q2 — guard too narrow when publisher left?** **FAIL.** With original guard `if (publisherCurrent && cfSessionId mismatch)`, when `publisherCurrent === undefined` (publisher left), the guard does NOT fire. `tearDownPeerSubscription` may have sent mids.length=0 (no midToEntry entries yet since subscribe was still in-flight), so CF side is NOT closed. Stale in-flight POST then binds dead response. **Fix applied**: changed guard to `if (!publisherCurrent || publisherCurrent.cfSessionId !== publisher.cfSessionId)`.

**Q3 — queue stuck on `return`?** PASS. `return` resolves the queue item; `.catch()` not triggered; `subscribedClientIds` not cleared; queue advances to new-cfSession doSubscribe.

**Additional gap (handleSfuRoster):** Codex55 flagged: "If roster snapshots can carry reconnect updates for existing subscribers, mirror the direct subscribeIfNeeded there too." **Verified: NO.** `sfu-roster` is only sent to NEW PEERS on admission (`sendSfuRosterToNewPeer` at signaling/index.ts:722). Existing peers receive `sfu-presence` on reconnect. Comment added to `handleSfuRoster` explaining why no direct call is needed.

---

## Final Changes (post red-team)

| File | Additional change |
|------|-------------------|
| `frontend/src/app/services/sfu-client.service.ts` | Guard widened: `!publisherCurrent \|\|` (covers publisher-left case); `handleSfuRoster` comment added |
| `frontend/src/app/services/sfu-client.spec.ts` | SFU-R5 added (publisher-left in-flight guard); three direct `doSubscribeTracks` tests seeded with matching `remotePublishers` entry |

---

## Verdict

**STATUS: DONE**

- Fix 1 (`handleSfuPresence` direct re-subscribe): PASS
- Fix 2 (`doSubscribeTracks` stale-cfSession guard, `!publisherCurrent || cfSessionId mismatch`): PASS (codex55 FAIL→fixed)
- Tests SFU-R3 + SFU-R4 + SFU-R5: ALL PASS (tsx exit 0)
- `npm run build` ✓ — bundle: `main-253BGJEF.js`
- `pm2 restart meet-poc-fe` ✓ — pid 1476000, status online, restart #55
