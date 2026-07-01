# Codex55 Verdict — B0 Recovery Ladder

## Verdict

Use the hybrid escalation ladder, not retry-only and not immediate full rejoin.

The existing architecture is already close: `SfuClientService` owns one serialized PC mutation queue, Cloudflare session state maps to the browser `RTCPeerConnection`, `remotePublishers` is the app-level roster, and subscribe/retry/renegotiate paths already exist. The defect is the terminal cap in `nextSubscribeRetry()` / mid-call retry and the stalled-audio watchdog's terminal `mark-stalled` behavior. B2 should replace those terminals with bounded escalation and one coalesced fresh-`cfSessionId` rejoin when same-session recovery cannot converge.

Cloudflare docs consulted: current Realtime docs define a Session as directly correlated with one WebRTC `RTCPeerConnection`, tracks as media tracks globally retrievable within an app, `/tracks/new` as the add/pull endpoint, and `/renegotiate` as required when a previous response asks for immediate renegotiation.

## Escalation Ladder

Trigger the ladder only while all are true:
- local page is still admitted/in-call and has `currentSessionId` + participant id;
- local publish is `published` or the failure is the Glory-like publish/PC recovery path;
- the remote publisher is still present in `remotePublishers`;
- the publisher still advertises at least one audio track;
- publisher mic state is not explicitly off. If `peer.micEnabled === false`, treat silence/no energy as healthy silence and clear voice-stall state.

Use one recovery coordinator inside `SfuClientService`, keyed by recovery epoch plus publisher id. It must coalesce duplicate triggers, never run PC-mutating work outside `enqueue()`, and emit diagnostics for every rung: `subscribe-retry`, `subscribe-renegotiate`, `sfu-rejoin`, `recovered`, `throttled`, `unrecovered-visible`.

Recommended rung order:

1. **Same-session subscribe retry**
   - Causes: `/api/sfu/tracks` reject/timeout including 406, subscribe stuck >10s with no `ontrack`, advertised audio remains not subscribed after grace.
   - Scope: per publisher.
   - Action: clear that publisher's subscription state (`midToEntry`, `subscribedTracks`, remote stream maps, timers, subscribed guard), then re-run `doSubscribeTracks()` for missing advertised tracks.
   - Bounds: 3 attempts per `{publisherClientId, publisherCfSessionId, localCfSessionId, epoch}` using exponential backoff `250ms, 500ms, 1000ms` plus small jitter. Current global cap of 7 is too slow before escalation.

2. **Forced same-session renegotiated subscribe**
   - Causes: same-session retry cap, live mid conflict after its existing retry cap, or stuck/advertised-not-subscribed still true after the retry rung.
   - Scope: per publisher, still same local `cfSessionId`.
   - Action: call `doSubscribeTracks(currentPublisher, missingTracks, { forceRenegotiation: true })` after clearing publisher subscription state.
   - Bounds: 2 attempts per same key, backoff `500ms, 1000ms`.

3. **Full local SFU rejoin with fresh `cfSessionId`**
   - Causes: forced renegotiated subscribe cap; 406 persists through same-session rungs; multiple publishers are advertised-not-subscribed in the same watchdog sweep; stale/poisoned local session suspicion; or remote-audio watchdog exhausts playout recovery and per-publisher subscription recovery.
   - Scope: local session-wide. This temporarily resets all local inbound streams because one Cloudflare Session maps to one local PC.
   - Action: rotate local Cloudflare session/PC, re-publish local tracks, announce new `sfu-publish`, then subscribe to all advertised remote publishers.
   - Bounds: coalesce all pending publisher failures into one rejoin. At most 1 full rejoin per 15s and 2 full rejoins per 2-minute window. After that, keep the call visibly degraded and continue low-frequency recovery at 60s intervals while admitted and advertised audio remains. This honors "never silent terminal give-up" without retry storms.

4. **Visible unrecovered state, not silent give-up**
   - If throttled after repeated full rejoins, show/log an unrecovered SFU media failure with an actionable recovery button. Do not leave only console warnings or a latched internal guard. Diagnostics must make the current rung/throttle visible.

## Full SFU Rejoin Mechanism

"Full SFU rejoin" here must mean **local SFU transport/session rotation**, not leaving the app room or rebuilding WebSocket admission.

Concrete sequence:

1. Acquire a recovery lock and increment a local SFU recovery epoch. Every async subscribe/publish/close/renegotiate path that can bind mids, streams, or publish state must capture the epoch and abort binding if it has changed.
2. Snapshot `remotePublishers()` and app-level peer identity state. Do not clear the roster; it is the source of truth for resubscribe after fresh publish.
3. Clear local transport/session state:
   - close old `RTCPeerConnection` and null `ontrack`/state handlers;
   - clear `subscribedClientIds`, `midToEntry`, `pendingOntrack`, conflict warnings, retry attempts/timers, stuck timers, remote stream maps, remote track names, and `subscribedTracks`;
   - reset connection quality and adaptive camera state;
   - clear remote-audio registry indirectly via `remoteStreams`/`remoteTrackNames` changes.
4. Do **not** stop the existing local microphone/camera/screen tracks. Reuse current `MediaService` streams.
5. Create a new `RTCPeerConnection`, `POST /api/sfu/session`, publish local audio/video tracks with `POST /api/sfu/tracks`, set the remote answer, and set `localPublishState` with the fresh `cfSessionId`.
6. Re-publish active screen share if present, using the existing screen publish path.
7. Announce the fresh publish over WebSocket (`sfu-publish`) so other admitted clients clear their stale subscription state and resubscribe to this client.
8. Re-drive local subscriptions to every current remote publisher except self. The existing Angular effect over `remotePublishers()` + `subscribeRetryVersion` can do this if B2 bumps the version after fresh publish; an explicit `subscribeAllAdvertisedRemotes()` helper is cleaner and testable.

Guards required:
- Do not duplicate subscriptions: `isTrackSubscribed()` and `subscribedClientIds` still gate normal paths, but B2 must also add epoch checks after every awaited HTTP/SDP step before mutating `midToEntry`, `subscribedTracks`, `remoteStreams`, or `localPublishState`.
- Do not leave ghost streams: `clearPublisherSubscriptionStateForRetry()` is good for per-publisher recovery, but full rejoin must use the broader local transport cleanup so `RemoteAudioService.syncPeers()` removes old audio elements.
- Do not clobber unrelated healthy remotes before it is necessary: rung 1 and rung 2 are per-publisher. Rung 3 is allowed to reset all inbound streams because the local Cloudflare session/PC is now suspect; coalesce rather than running one full rejoin per failed publisher.
- Do not reset `opQueue` in a way that lets old in-flight work mutate a new PC without an epoch guard. Current `resetForTransportRecovery()` resets queue state; B2 must either serialize the reset through the queue or add hard epoch checks to make stale continuations no-op.

## Stalled Remote Audio

B3 should call the same recovery coordinator instead of adding a separate same-session-only `resubscribePublisher()` loop.

Decision rules:
- `peer.micEnabled === false`: clear/hold, no SFU recovery.
- emitted samples or voice energy advanced: clear voice-stall attempts.
- bytes arrive but emitted/energy do not advance: run playout recovery first (`resume`, `kickstart`, `replay`, `rebuild`), then escalate into the subscription ladder if still stalled.
- no inbound bytes for an advertised audio track after the grace window while publisher mic is on/unknown: treat as advertised/subscribed-no-RTP failure, not as healthy silence.
- after a per-publisher subscription recovery succeeds, reset that publisher's voice watchdog attempts.

## 406 Read

The backend is correctly thin: it checks admission and local ownership, forwards `/api/sfu/tracks` to Cloudflare, and passes non-OK statuses through. The 406 is therefore Cloudflare rejecting the requested track operation, not an Express/auth classification.

Most plausible causes, in priority order:
- remote publisher session or track is stale/closed/not propagated when the subscriber asks for it;
- same local Cloudflare session is in a bad negotiation state after prior subscribe/close/renegotiate race;
- request SDP/transceiver/mid state no longer matches Cloudflare's session model;
- less likely, malformed track params or simulcast preferences for the current track.

Recovery should not branch heavily by guessed 406 cause. The same ladder is sufficient: short same-session retry covers propagation races, forced renegotiation covers SDP/session drift, fresh local `cfSessionId` covers poisoned local session/PC state. B1 must still capture exact evidence:
- raw/sanitized CF `errorCode`, `errorDescription`, HTTP status, endpoint, local `cfSessionId`, remote publisher `cfSessionId`, track names, and `pc.signalingState`/connection state at failure;
- whether the 406 occurred for local publish or remote subscribe;
- whether `requiresImmediateRenegotiation` was expected/previously pending;
- proof that these errors no longer land in `lastGumError`.

## Prior-Art Disposition

Keep:
- the `publisherMicEnabled` guard for healthy silence;
- the concept that stalled inbound audio should escalate from playout recovery into SFU subscription recovery;
- the need to clear publisher subscription state before resubscribe;
- the `tearDownPeerSubscription()` insight that cleanup must remove maps/streams even if `subscribedClientIds` is already false. Otherwise advertised-not-subscribed states can keep stale local artifacts.

Drop or rewrite:
- same-`cfSessionId` only `resubscribePublisher()` as the terminal answer. It repeats the old session after the session may already be poisoned.
- capped `mark-stalled` as final behavior. It violates the locked direction.
- unrelated Playwright helper changes from the patch unless B1 specifically needs them for the harness.
- tests that assert "bounded by recovery cap" into `mark-stalled`; replace with tests asserting escalation to forced renegotiate, then fresh-session rejoin, then visible throttled recovery.

## Plan Review

B1 -> B2 -> B3 -> B4 -> B5 -> B6 -> B7 -> B8 -> B9 is broadly correct and should remain mostly linear.

Adjustments:
- B1 must reproduce current cap-to-silent behavior before any fix and must include stale in-flight operation cases: old subscribe response arriving after full rejoin must not bind to the new PC.
- B2 owns the shared recovery coordinator and the cap-to-rejoin ladder for subscribe failures. It should include focused reducer/service tests for the ladder, not only Playwright.
- B3 should be built on B2's coordinator, not as an independent resubscribe loop.
- B4 should be upgraded to high risk and `[REDTEAM:standard]` because Glory's `hasPc:false`/no publish state was a real participant-breaking mode in the 5-way call.
- B5 can remain after B4, but B2/B3 should already emit recovery diagnostics; B5 is the diagnostics-page/payload cleanup and `lastGumError` separation pass.
- B6 should include 5-person coalescing: multiple simultaneous advertised-not-subscribed publishers should cause one full local rejoin, not N rejoin storms.

Assignments:
- Keep `[DELIB]` on B0 and B2.
- Keep `[REDTEAM:elite]` on B2.
- Keep `[REDTEAM:standard]` on B3 and B6.
- Add `[REDTEAM:standard]` to B4.

Stack references consulted:
- `project_specs.md` §14 `[arch]` / `[reviewer]` guidance for Cloudflare Realtime SFU, validation, and forbidden pivots.
- `/home/agjrom/.codex/skills/sysarch/references/stacks/webrtc-coturn-node.md`, especially the Session/PC mapping, serialized PC mutation, and reconnect state-reset landmines.
- Cloudflare Realtime Sessions/Tracks and Connection API docs, last updated April 21, 2026.

STATUS: PROPOSED
