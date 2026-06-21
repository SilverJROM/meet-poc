# B15 — Independent Validation (3-agent): BK1/BK2 backend admit

**Verdict: SOLID** — committed `b38d2b3`. 22 backend tests pass (12 reconnect + 4 acting-host + 6 host-actions). Verifier ≠ fixer; validator did not edit.

## Scope
- BK1: replace stale `ownerHasJoined` latch with `hasOwnerPresentOrReconnecting(live,roomId,db)` (admitted owner OR owner in reconnect grace). `promoteNextActingHost` only when no owner present; owner-expiry triggers election.
- BK2: `removeAdmittedPeer(..., {revokeIdentity})` calls `revokeClientIdentity` only on host kick + explicit leave, so `canAutoAdmitByIdentity` cannot bypass knock/passphrase after removal; graceful drop preserves identity.

## Adversarial findings (all confirmed safe)
1. **Owner reconnect grace blocks premature election** — `ws.on('close')` → `startReconnectGrace` puts owner into `live.reconnecting`; the acting-host drop path then calls `promoteNextActingHost`, but `hasOwnerPresentOrReconnecting` finds the owner in `reconnecting` and suppresses promotion. ✅
2. **Promotion after true expiry** — `expireReconnectingPeer` ordering is correct: `cleanupReconnectState` deletes the peer from `live.reconnecting` *before* `if (wasOwner) promoteNextActingHost(...)`, so the presence check correctly returns false and election proceeds. New test covers owner-disconnect → grace-expiry → guest promoted → promoted guest admits a pending knocker. ✅
3. **Original bug (owner left without ending) fixed** — `leave` → `removeAdmittedPeer(..., {revokeIdentity:true})` → `if (wasActingHost || isHost) promoteNextActingHost(...)`. The `isHost` arm is new (previously only `wasActingHost` triggered). Pending users now get a host to admit them. ✅
4. **revokeIdentity scoped precisely** — passed ONLY at host kick (`remove-peer`) + explicit `leave`. NOT in `ws.on('close')` (graceful drop → `startReconnectGrace` only), so a normal drop preserves `clientIdentities` (`wasAdmitted:true, revoked:false`) and `canAutoAdmitByIdentity` stays true → genuine reconnects auto-admit after grace. ✅
5. **No regression** — normal owner admit, knock/admit, host-transfer, acting-host handoff, reconnect-token resume, clientKey grace, durable recovery after expiry: all intact. Stale `ownerHasJoined` fully purged (zero occurrences). ✅

## Non-blocking observation
`shouldActAsFirstOpenRoomHost` now uses `!hasOwnerPresentOrReconnecting(...)` instead of `!live.ownerHasJoined` — marginally more expensive (iterates reconnecting map) but semantically tighter: correctly prevents a guest self-promoting as first open-room host while the owner is in reconnect grace. Behavior improvement, not a regression.
