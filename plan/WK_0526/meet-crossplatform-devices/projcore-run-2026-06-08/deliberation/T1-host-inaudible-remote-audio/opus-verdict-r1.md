# opus verdict — T1 round 1

## Root-cause finding(s)
| # | claim | confidence | evidence file:line | anomaly |
|---|-------|-----------|--------------------|---------|
| 1 | **All remote audio funnels through ONE shared mixer output `<audio>` element; per-peer kickstart elements are `muted=true`. So a single failed/silent output element = host hears EVERYONE silent** — exactly "can't hear either of his 2 devices". | proven (architecture) | remote-audio.service.ts:538 `bindOutputElement` (single `outputElement`), :552-566 `createKickstartElement` sets `audio.muted = true`, :464 `addSource` routes into shared `gain→limiter→destination` | A (dominant) |
| 2 | **The single audible path depends on AudioContext state `running` AND the output element actually playing.** If the context stays `suspended` (autoplay) or the element never plays, RTP can flow (bytesReceived climbs) with zero audible output. Matches evidence: clean inbound RTP, 0 loss, host hears nothing. | likely | remote-audio.service.ts:507 `ensureGraph` (new AudioContext starts 'suspended' until resume), :263-319 `unlockAndPlayRemoteSinks` only resumes inside a real gesture; room.page.ts:634-640 non-gesture `setTimeout(0)` re-unlock (resume rejected off-gesture) | A |
| 3 | **getStats inbound DOES extract `audioLevel` (line 749) but `totalAudioEnergy` is NOT extracted at all** → R3 gap is real and specific. audioLevel was null in capture because the inbound audio receiver had no active decoded level at sample instants / field absent for the mixed-but-not-played track. | proven | sfu-client.service.ts:736-753 inbound stat builder — has `audioLevel` (749) + `concealedSamples` (748) but NO `totalAudioEnergy`, no playout/AudioContext state, no per-publisher mixed-flag | C (R3) |
| 4 | One-publisher-at-a-time is NOT a stream-map displacement: `remoteStreams` is keyed per `publisherClientId`, both coexist. The getStats "one at a time" is most likely transceiver/mid reuse on CF renegotiation OR a sampling artifact (only one inbound-rtp with a live `midToEntry` mid at each instant). Needs round-2 confirmation. | hypothesis | sfu-client.service.ts:804-828 `processOntrack` per-publisher MediaStream (no removeSource of peer1 when peer2 arrives); :730-735 inbound loop keyed by live `midToEntry.get(mid)` | B |

## Contributing bugs / races / alternative causes
- **Output sinkId routed to a stale/absent device.** `selectedAudioOutputId()` persisted from another machine/session → `setSinkId` throws → falls back to `setSinkId('')`. Fallback exists (remote-audio.service.ts:97-111) but if the *default* sink is also wrong (e.g. external mic device, no speakers) host is silent. Analogous to the 2026-06-04 deviceId-`exact` cross-device bug but on the OUTPUT side. (room.page.ts:2667 passes `selectedAudioOutputId()`.)
- **`mutedAll` / volume=0 stuck** → gain=0 → silence (remote-audio.service.ts:195-205). Low probability (user would know) but cheap to rule out.
- **Banner correctness:** the `remoteAudioBlocked` banner (room.page.ts:650-658) is the user-facing tell for "suspended-with-sources". If JROM did NOT see a banner yet heard nothing, either the banner logic is wrong OR context WAS running but output/sink failed (points away from #2, toward sinkId). KEY disambiguator — ask JROM if he saw an "audio blocked / tap to enable" banner.
- **Gesture-recovery listeners** (room.page.ts:2801-2802 global pointerdown/click capture → recovery) SHOULD resume context on any click. If JROM clicked during the call and still heard nothing, that weakens pure-autoplay (#2) and strengthens sinkId / output-element / one-shared-element-bind failure.

## Fix approach (mechanism-level)
1. **Make remote audio NOT depend on a single shared element + Web-Audio graph for audibility.** Strongest fix: give each remote publisher its OWN audible `<audio>` element (unmuted, srcObject = that publisher's stream), in addition to / instead of the muted kickstart + single mixer output. Removes the SPOF and the autoplay-on-one-element fragility. (Mixer can stay for volume/limiter, but audibility should not hinge on one element.) — remote-audio.service.ts createKickstartElement/bindOutputElement.
2. **Guarantee context resume + output play on the host's join gesture and on every subsequent click** — verify the L2801 listeners actually call `unlockAndPlayRemoteSinks` and that it resumes; add an explicit in-call "tap to enable audio" affordance when `contextState !== 'running'`.
3. **Harden output sink fallback**: if `setSinkId(deviceId)` fails, clear the stored id (already done) AND verify the default sink actually produces output; never leave audibility pinned to an unverified device.
4. Resolve anomaly B in round 2 (transceiver reuse vs artifact) before deciding if a separate fix is needed.

## R3 diagnostics to add (exact fields + where)
In `sfu-client.service.ts:736` inbound builder add: `totalAudioEnergy`, `totalSamplesReceived`, `insertedSamplesForDeceleration`. Add a NEW top-level playout block to the sample payload: `{ audioContextState, outputElementAttached, outputElementPaused, outputElementMuted, mixerSourceCount, mixedPublisherIds[], mutedAll, volume, selectedAudioOutputId, perPublisherAudibleElementPaused{} }` sourced from `RemoteAudioService.debugSnapshot()` (remote-audio.service.ts:428). Goal: one future row localizes failure to subscribe / decode / mixer / sink / autoplay without guessing.

## Holes I could NOT rule out
- Decode vs sink: cannot prove from current data which (that's why R3). 
- Whether JROM saw the remoteAudioBlocked banner (disambiguates autoplay vs sink) — needs JROM input.
- Anomaly B mechanism unconfirmed (transceiver reuse vs sampling).

STATUS: REVISE — strong dominant root cause (single-shared-output-element SPOF + autoplay/sink fragility, evidence-backed) but need round 2 to (a) confirm context-was-suspended vs sink-failure via banner/gesture reasoning, and (b) settle anomaly B mechanism, before committing the exact fix.
