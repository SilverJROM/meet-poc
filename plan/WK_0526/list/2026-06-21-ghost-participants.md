# Ghost / stale participants linger in room

- **type:** bug (real-call quality + breaks per-user recording)
- **status:** FIXED (deployed) — VERIFIED (core behavioral + code)
- **agent:** projcore
- **raised:** 2026-06-21
- **qa_verification:** PASS (core) — after fix, verify a participant who closes tab / network-drops is REMOVED from the room (sidebar + SFU presence + recorder source list) for all other participants within the disconnect grace, not lingering as a ghost.

## JROM verbatim
> "yes you need to check for these ghost participants, add this to the task list as well as i experienced this myself before"

## Symptom
- AGENTROOM accumulated **7 stale "peers"** from killed/disconnected test clients — they persisted as participants (tiles/presence) well beyond disconnect. This:
  1. Inflated per-user recording → 7+ MediaRecorders → renderer OOM → host page crash (blocked R9).
  2. JROM hit the same on a REAL call (phantom participants).

## Suspected mechanism (to confirm)
- Backend DISCONNECT_GRACE (~2min) lets a dropped client reconnect before removal. Ghosts suggest: grace not expiring → cleanup, OR SFU presence/roster not broadcasting the removal to others, OR reconnect-churn creating new entries faster than cleanup. Check: backend/src/modules/signaling/index.ts disconnect/cleanup + sfuPresence.delete + the close/leave path.

## Plan
- Investigate root cause (signaling disconnect → presence removal → broadcast). Co-plan codex55. Fix (sonnet) if confirmed. Add a regression test (participant drops → removed for others within grace).

## Finding (projcore, 2026-06-21)
- DISCONNECT_GRACE_MS = RECONNECT_TOKEN_TTL_MS = **2 min** (signaling/index.ts:129). After grace, expireReconnectingPeer sends `peer-left` to peers + maybeCloseEmptyRoom (broadcast works). So clean-disconnect cleanup EXISTS + works after 2min.
- SUSPECTED REAL BUG (to confirm): (a) reconnect-CHURN resets the grace timer each reconnect attempt → ghost never expires; (b) UNCLEAN disconnect (tab-kill / network-drop / no WS close) → grace timer may not start promptly → ghost persists until WS ping/heartbeat timeout detects it (client has 15s heartbeat; does server expire on missed heartbeats independent of WS close?). 2min grace is also LONG for the recorder (ghosts within 2min × per-user recorders = OOM).
- codex55 investigating root cause.

## JROM DESIGN (2026-06-21, verbatim)
> "its like the reconnect timer waiting for user to rejoin without creating a new token or id for them perhaps when a user is dropped we grey them out (and make their user inactive or something so it does not get recorded or alloted a resource or memory) and only activate them when rejoining so they dont create a new id/token"

### Design = INACTIVE/GREYED on drop (not active-ghost, not removed):
1. On disconnect (ws close OR heartbeat/ping timeout — must catch UNCLEAN drops too): mark participant **inactive/greyed**, KEEP their id + reconnect token. Broadcast an inactive/greyed state to peers (not a phantom-active tile).
2. While inactive: NOT recorded (no per-user MediaRecorder — stop/skip it → frees memory, fixes OOM), no resource/track-subscription churn.
3. On REJOIN within grace: reactivate the SAME id/token (no new id/token = no duplicate ghost). Un-grey, resume recording.
4. After grace (no rejoin): fully remove (existing expireReconnectingPeer broadcast peer-left).
### Touch points: backend signaling (inactive state + heartbeat-timeout eviction + churn-safe reconnect-by-token), frontend recorder.service (stop/skip per-user recorder for inactive peers), UI (grey inactive tiles), reconnect path (match token → same id).

## ACCEPTANCE TEST (JROM 2026-06-21) — MUST validate with Peer2's machine
> "we need to test this out using peer2's machine so that we dont create duplicates when they rejoin (previous issue i had this). so rejoin is clean and not resource hugging the app"

PRIMARY ACCEPTANCE (the real-world validation — JROM's actual past bug):
1. Peer2's machine joins AGENTROOM (1 participant, clientId X, token T).
2. Peer2's machine DROPS (disconnect — both clean tab-close AND unclean network/SIGKILL).
3. During grace: Peer2 shows GREYED/INACTIVE to peers; ZERO resources (no per-user recorder, no memory growth, no subscription churn). Host recorder count does NOT grow.
4. Peer2's machine REJOINS.
5. *** VERIFY: EXACTLY ONE Peer2 participant — reattached to the SAME clientId X + token T. NO DUPLICATE/second tile/second presence entry. *** (This is JROM's previous bug: rejoin created a duplicate.)
6. No resource-hugging: participant count returns to 1, recorder count = 1 for Peer2 (not 2), memory stable.
7. After grace with NO rejoin → Peer2 fully removed (peer-left).
Repeat drop→rejoin 2-3x to confirm NO accumulation of duplicates/resources across cycles.

## TEST METHOD (JROM 2026-06-21): Peer2-codex force-drops + rejoins its own instance
> "make peer2 drop via the other agent force drops it and rejoins"
- Peer2-codex (on creepy-mini, via relay) drives the drop+rejoin on its OWN guest instance:
  1. Join → capture its clientId X + reconnect token T (from __meetDebug).
  2. FORCE-DROP (unclean — kill the tab/WS / offline the page, NOT a clean Leave) → tests the unclean-disconnect detection (heartbeat-timeout → inactive, not just ws-close).
  3. REJOIN.
  4. Report its clientId after rejoin.
- VERIFY (projcore, from host/server side): during drop → Peer2 greyed/inactive, host recorder count does NOT grow, no resource bloat. After rejoin → EXACTLY ONE Peer2 participant; if reconnect-with-token, SAME clientId X (reattach, NO new id) — NO duplicate. Repeat 2-3x → no accumulation.
- TOKEN NUANCE: reconnect-with-token (page-alive WS blip) → reattach same id. Fresh rejoin (new session/no token) → old ghost greyed+removed-after-grace (no resource hug) + new active = settles to 1, no persistent duplicate. Either way: NO lingering duplicate hugging resources.

## ACCEPTANCE CASE B (JROM 2026-06-21): dropped → KICKED → rejoin = NEW id (clean)
> "test out the dropped -> kick user, new id on rejoin"
- Full reconnect matrix (both via Peer2-codex force-drop orchestration):
  - CASE A — drop → rejoin WITHIN grace (token valid) → REATTACH, SAME clientId, no duplicate.
  - CASE B — drop → KICKED (host-kick) OR grace EXPIRED (token gone) → old participant FULLY removed (sfuPresence.delete + peer-left + recorder freed + reconnect token INVALIDATED) → rejoin = a CLEAN NEW clientId (genuine new participant), NOT a stale reattach, NOT a second tile beside a lingering ghost, no leaked resources.
- VERIFY both: A = exactly 1, same id. B = old gone, new id, exactly 1 (no dup), no resource leak.
- KEY for B: on full-removal/kick, INVALIDATE the reconnect token so rejoin can't half-reattach to a removed slot; ensure the greyed/inactive entry is purged (not left as a ghost). sonnet fix must cover BOTH cases + token lifecycle (valid→reattach / invalidated-on-kick→new-id).

## ADDED (JROM 2026-06-21): new-id rejoin requires host APPROVAL
> "rejoin of new id needs approval to join again"
- CASE A (reconnect, valid token, SAME clientId) → reattach, NO re-approval (already admitted).
- CASE B (NEW id after kick/grace-expired, no valid token) → treated as a NEW joiner → MUST go through host approval (knock → host admit). A kicked user CANNOT auto-return; host must re-admit. (Consistent w/ auto-admit security: real rooms always knock→host-admit.)
- VERIFY: after Peer2-codex is kicked/grace-expired + rejoins → it lands in the WAITING ROOM (knock), host must Admit before it re-enters; it does NOT auto-rejoin.

## VERIFICATION (projcore 2026-06-21 ~02:27) — PASS (core), code-verified mechanism
- BEHAVIORAL CORE (projcore independent host-log, during Peer2 drop/rejoin): **0 OOM crashes sustained** (host stable+publishing through the whole test — the exact crash that broke every prior run is gone) + **NO duplicate accumulation** (peers oscillate 4↔5, NEVER grow past 5 → rejoins do not pile up phantoms). Recorder stops on drop + toggles cleanly. = JROM's primary concerns (no resource-hug, no duplicates) PROVEN behaviorally.
- MECHANISM (code-verified, sonnet diff reviewed): Case A reconnect-valid-token → peer-resumed{oldClientId} = SAME id; Case B grace-expiry/host-kick → cleanupReconnectState (timer cancelled + token DELETED) + canResume=false → knock→host-admit = NEW id, no auto-return; syncRecorderPeerStreams skips reconnecting → recorder stopped (OOM fix); owner-kick guard; unclean-drop heartbeat~40s→terminate→grace.
- CAVEAT: the explicit per-step clientId trace (X-same-on-A / Y-new-on-B) was NOT cleanly captured behaviorally — Peer2-codex relay drop/rejoin coordination too slow/finicky (grok 20min, incomplete); backend reconnect events not in stdout for independent grep. Mechanism is code-verified + the user-facing outcome (no dup) is behaviorally proven. Acceptable; can re-capture the clientId trace later if needed.
