# Multi-peer (4-5+ users) audit + fix plan

JROM's question: does the SFU code handle 4-5+ peers correctly, or are there latent bugs that only surface at higher peer counts? The 2-peer flow is the simplest case; multi-peer adds:
- N-1 subscribes per peer (each new peer subscribes to all existing publishers; each existing peer subscribes to the new joiner).
- Serialized renegotiations via opQueue (per-PC, not per-room).
- Larger m-line counts in CF SFU answers/offers.
- More concurrent ontrack events landing in tighter time windows.
- Higher inbound video bandwidth → may need simulcast-layer adjustments.

## What I need from you

**Audit phase first.** Read the following and report findings BEFORE writing any code. Specifically check whether each of these holds at N=4–8 peers:

### A. Reconcile correctness with growing transceiver set
File: `frontend/src/app/services/sfu-client.service.ts:899-925` (`doSubscribeTracks` renegotiation branch).

The reconcile uses `existingMids` (snapshot before HTTP POST) and `newTransceiverMids` (mids NOT in existingMids after setRemoteDescription). With 1 prior subscribe (so 4 mids: 2 publish + 2 subscribed peer 1), then subscribing to peer 2:
- existingMids = {0, 1, 2, 3}
- After setRemoteDescription, getTransceivers includes new mids 4, 5
- newTransceiverMids = [4, 5]
- responseTracks from CF for peer 2 = [audio, video]
- reconcile pairs audio→4, video→5 — positional

Verify: does CF guarantee `responseTracks` ordering matches `getTransceivers` ordering? If CF returns video-then-audio in responseTracks but the offer SDP has audio-then-video m-lines, the pairing is wrong → wrong publisherClientId attached to mid → wrong stream.

Look at `sfu-mid-reconcile.ts` (`reconcileSubscribedMids` implementation) — what assumption does it make?

### B. opQueue serialization actually holds for concurrent subscribes
Scenario: peers 3, 4, 5 all join in quick succession (within 100ms). Each one publishes → `sfu-presence` broadcasts → existing peers' `subscribe-effect` fires three times back-to-back. `subscribeIfNeeded` is called for each new publisher. Each enqueues a subscribe op.

Verify:
- The `subscribedClientIds.add(...)` BEFORE enqueue (line 89): prevents double-enqueue for the same publisher. ✓
- But: the subscribe-effect ITERATES `remotePublishers` and calls `subscribeIfNeeded` for each. If the effect fires while op[0] is in flight, op[1] and op[2] enqueue behind it. Sequential. ✓
- What if the effect fires THREE separate times for three publishers? The serialized opQueue handles it. Confirm no parallelism bug.

### C. ontrack flood + buffer (pendingOntrack)
When subscribing to peer 3 with renegotiation, ontrack fires for peer 3's audio + video. Both buffered if midToEntry not ready, then flushed.

Verify:
- The buffer is keyed by `mid`. Multiple peers' mids don't collide. ✓
- But: when subscribe to peer 4 renegotiates RIGHT AFTER peer 3's, are there stale entries in pendingOntrack from peer 3 that get flushed inadvertently with peer 4's flush? `flushPendingOntrack` iterates ALL entries and processes those whose mid is in `midToEntry`. So stale entries DON'T flush against the wrong publisher (they wait for their own midToEntry update). Confirm this holds.

### D. Per-peer simulcast layer pref + `cameraRidNow`
File: `sfu-client.service.ts` — find `cameraRidNow`, `priorityOrdering`, `preferredRid`.

With 4-5 peers, the bitrate budget per inbound video stream shrinks. Are we correctly requesting LOWER simulcast layers when N grows? Or do we always request 'l'? If we request 'h' for many peers, the user's downlink saturates.

### E. Peer-leave cleanup
File: `sfu-client.service.ts` — find handlers for peer-left / `removeFromRoster` / `handlePeerLeft`.

When peer 3 leaves at peer_count=5:
- Their tracks should be removed from midToEntry
- Their stream should be removed from remoteStreams
- Their pendingOntrack entries (if any) should be cleared
- Their subscribedClientIds entry must be removed (so a future re-join can re-subscribe)
- Their subscribeStuckTimer must be disarmed
- Their subscribeRetryAttempts/Initiated/FirstFrameAt entries must be cleaned

Verify ALL of these happen. Look at the `handleSfuRosterRemoved` or equivalent path.

### F. CF SFU session limits / track limits
Read `https://developers.cloudflare.com/realtime/sfu/sessions-tracks/` (via WebFetch).

Are there CF-side limits on tracks-per-session or sessions-per-app that we'd hit at N=8+? Document the published limits.

### G. WebAudio mixer scaling
File: `frontend/src/app/services/remote-audio.service.ts`.

`syncPeers` adds a MediaStreamAudioSourceNode per peer. With 8 peers, that's 8 sources mixed into one destination. Browsers handle this. But: confirm no per-source resource leak (i.e., when a peer leaves, the source IS disconnected).

### H. Backend `peerSummaries` and `sfu-roster` payload size
File: `backend/src/modules/signaling/index.ts` — `sendSfuRosterToNewPeer`.

When a new peer joins a room with N=7 existing peers, they receive `sfu-roster` with 7 publishers' tracks. Each publisher has audio + video = 14 track entries. Reasonable size. But: are there any N² broadcasts? When peer 8 joins, backend broadcasts `peer-joined` to all 7 admitted clients. When peer 8 publishes, backend broadcasts `sfu-presence` to all 7. That's 7 messages per join, OK.

### I. UI rendering at N=6+
The room.page.html has `showPeerWarning` for `peers().length >= 6`. That's a UX hint. But: does the grid layout in room.page.scss actually accommodate 6-8 tiles cleanly, or does it overflow / stretch poorly? Check `.tiles-grid` and its `data-count` attribute.

## Output format

Reply ONLY in this format. **Do not write code yet.**

```
STATUS: AUDIT-COMPLETE

A. Reconcile correctness — OK / RISK / BROKEN — <one-line evidence>
B. opQueue serialization — OK / RISK / BROKEN — <one-line evidence>
C. ontrack buffer multi-peer — OK / RISK / BROKEN — <one-line evidence>
D. Simulcast layer pref — OK / RISK / BROKEN — <one-line evidence>
E. Peer-leave cleanup — OK / RISK / BROKEN — <one-line evidence>
F. CF SFU limits — <documented limit number, if any>
G. WebAudio mixer leak — OK / RISK / BROKEN — <one-line evidence>
H. Backend broadcast scaling — OK / RISK / BROKEN — <one-line evidence>
I. UI grid at N=6+ — OK / RISK / BROKEN — <one-line evidence>

CRITICAL ISSUES (will break at N≥4):
1. <issue> — <file:line> — <fix sketch>
2. <issue> — <file:line> — <fix sketch>

RECOMMENDED FIXES (incremental):
1. <issue> — <file:line> — <fix sketch>

NON-ISSUES (verified safe):
- <list>
```

Report concisely. I'll greenlight a focused fix batch after reading your audit.
