Batch-FIX3: Make doSubscribeTracks idempotent — no doubled audio when a default-muted peer unmutes (DOUBLE-SUBSCRIBE)

Batch ID: batch-fix3
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (FIX2 @ 0a0608e latest). Do NOT commit (3-AGENT: projcore + independent 2nd validator — SFU subscribe core).
Read FIRST: north-star.md (Zoom/Meet-level clean two-way audio), validation/POSTFIX1/round-tracker.md (DOUBLE-SUBSCRIBE section).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): LOW-MEDIUM. Confirm/counter at PROPOSED.

## THE BUG — CONFIRMED by the post-fix gate (R3 opus reviewer + opus verifier). A regression FIX2 widened.
A participant who joins with mic OFF and camera OFF (the common default-muted join → publishes `tracks:[]` → is NOT in `subscribedClientIds`) and then UNMUTES gets DOUBLE-SUBSCRIBED by every existing peer, producing DOUBLED/ECHOED audio for that peer for the session.

Mechanism (frontend/src/app/services/sfu-client.service.ts + room.page.ts effect):
- On unmute, `handleSfuPresence` runs: `remotePublishers.set(next)` (schedules the room.page subscribe effect) AND calls `subscribeNewRemoteTracks(nowPublisher, prev.tracks=[])` → `enqueueMidCallSubscribeTracks` → enqueues op#1 `doSubscribeTracks(A,[audio])`. The mid-call path NEVER adds A to `subscribedClientIds`.
- The deferred room.page subscribe effect then fires `subscribeIfNeeded(A)`: `subscribedClientIds.has(A)` is FALSE (mid-call path didn't set it) → not short-circuited; `tracks.length===1` passes; adds A to subscribedClientIds; enqueues op#2 `doSubscribe(A) → doSubscribeTracks(A, [audio])`.
- Both ops serialize via opQueue. Op#1 subscribes audio (populates midToEntry/subscribedTracks). Op#2's `doSubscribeTracks` does NOT dedup → second POST /api/sfu/tracks for the same trackName → second transceiver → second ontrack → a SECOND distinct MediaStreamTrack added to remoteStreams (MediaStream.addTrack only no-ops on the SAME instance) → audible doubled/echoed audio.
- NEW: FIX2 broadened the old screen-only mid-call branch (`!prevHadScreen && nowHasScreen` → subscribeNewScreenTrack) to all-tracks (`subscribeNewRemoteTracks`), creating the second concurrent subscriber for the zero-track-at-join → first-audio-track case (latent before because audio-on-join publishers were already in subscribedClientIds, so the effect short-circuited).

## Required fix (acceptance) — make doSubscribeTracks IDEMPOTENT (the single chokepoint both paths funnel through)
In `doSubscribeTracks` (frontend/src/app/services/sfu-client.service.ts), at the TOP of the transactional body — right after the existing `if (!tracks.length) return;` and BEFORE any mutation/stamp (subscribeInitiatedAt) and BEFORE the POST — filter out tracks already subscribed:
```ts
const tracksToSubscribe = tracks.filter((t) => !this.isTrackSubscribed(publisher.clientId, t.trackName));
if (!tracksToSubscribe.length) return;
```
…then use `tracksToSubscribe` (not the raw `tracks`) for the kindMap and the /api/sfu/tracks request body and everywhere downstream in that op. (`isTrackSubscribed` already exists from FIX2 and checks midToEntry + subscribedTracks by publisherClientId+trackName.)
Because both ops serialize through the single opQueue and op#1 populates midToEntry/subscribedTracks before op#2 starts, op#2's filter sees the audio already subscribed → returns early → NO second CF subscribe, NO second transceiver, NO duplicate stream track. This also hardens the join path and the FIX2 mid-call retry against any future double-trigger.

CAVEAT (must preserve): the new early-return must happen BEFORE the `subscribeInitiatedAt` latency-tracking stamp and before any state mutation, so a fully-deduped no-op subscribe does not stamp/mutate anything. A genuinely-missing track still passes the filter and subscribes exactly as today. Do NOT change the transactional rollback, reconcile, the FIX2 mid-call retry, the join path's subscribeIfNeeded/doSubscribe, or transport recovery.

## Required acceptance
1. join-muted+camera-off → unmute: exactly ONE subscribe for the audio track; ONE transceiver; ONE audio track in the peer's remoteStream → no doubled/echoed audio.
2. The first/genuine subscribe of a missing track still works (join path + mid-call retry both still subscribe a truly-missing track).
3. doSubscribeTracks called with an already-fully-subscribed set is a clean no-op (no POST, no stamp, no mutation).
4. No regression: B06 register-first-track, B08 join retry, B19 transactional rollback (S1) + reconcile (S3) + cfSession eviction (S2) + screen rollback (S4), B11 transport recovery, FIX2 mid-call retry (S-MIDCALL still closed — a genuinely-missing mid-call track still retries to success), multi-party all-hear-all.

## Scope guards (MANDATORY — bypass mode)
- FIX3 ONLY (the doSubscribeTracks idempotency filter). Touch: sfu-client.service.ts (the filter + use tracksToSubscribe downstream in that one method). Plus tests.
- Do NOT touch: the mid-call retry (FIX2), join-path subscribeIfNeeded/doSubscribe, the transactional rollback/reconcile, transport recovery, handleSfuPresence/Roster branching, media/recorder/signaling.
- Surgical — a filter + early-return + downstream variable rename within doSubscribeTracks only.

## Deterministic proof
- Unit specs (npx tsx, extend sfu-client.spec.ts): doSubscribeTracks with an already-subscribed track → no-op (no POST issued via the http mock, no midToEntry change, no subscribeInitiatedAt stamp); the double-trigger scenario (op#1 subscribes, op#2 for same track → second op is a no-op, exactly one transceiver/entry); a genuinely-missing track still subscribes; FIX2 mid-call retry of a truly-missing track still reaches subscribed.
- Re-run sfu-client + remote-audio* specs. `npx tsc --noEmit` app+spec ZERO. `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real join-muted→unmute no-echo on real devices is JROM's seat; unit proves the idempotency.

## Plan handshake (MANDATORY)
1. Read brief + doSubscribeTracks (full) + isTrackSubscribed + subscribeIfNeeded/doSubscribe + handleSfuPresence + the room.page subscribe effect + enqueue/opQueue serialization.
2. Reply PROPOSED: the exact insertion point + the downstream `tracksToSubscribe` usage + confirmation the early-return precedes subscribeInitiatedAt/mutation, test plan, files, risks, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → tsc 0 → specs → build → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/FIX3/)
scenarios.md, changes.md (Root Cause + the idempotency fix + per-file WHY + explicit no-regression-to-FIX2/join/transactional statement), review.md, test-report.md, independent-validation.md.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-fix3 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
