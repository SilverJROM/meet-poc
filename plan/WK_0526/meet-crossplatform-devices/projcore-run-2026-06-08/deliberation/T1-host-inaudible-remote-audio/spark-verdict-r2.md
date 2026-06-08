# spark verdict — T1 round 2

## Q1 — A-mechanism ranking (with discriminator evidence file:line)
1. **A3 (orphaned graph, then addSource fails) — MOST likely.**
   - Banner gate can be fully suppressed when `hasSources` is false (`remoteAudioBlocked` only evaluated when `hasSources` is true): `room.page.ts:651-659`.
   - `hasSources` in that effect comes from `remoteAudio.debugSnapshot().mixedPeerIds.length > 0` and that depends on `addSource` success (`remote-audio.service.ts:464-477`, `430-437`).
   - On reopened context, `ensureGraph` recreates `AudioContext` but does not reset old `gain/limiter/destination` references (`remote-audio.service.ts:508-535`); `addSource` can then throw on connect and silently returns in the catch block (`remote-audio.service.ts:475-477`).
   - This predicts: sources stay empty, audio truly silent, and banner does not appear.

2. **A4 (sink routing on mixer destination to specific device) — SECOND likely.**
   - Selected output is applied to the shared mixer output plus kickstarts only: `room.page.ts:2657-2658`, `remote-audio.service.ts:321-325`, `264-280`, `652-657`.
   - Failure path in `setSinkId` swallows to default and only reports debug, so a bad selected device or unsupported route can result in audible silence with no explicit hard-fail: `remote-audio.service.ts:85-112`.
   - This fits host selecting non-default output and hearing neither app output nor banner.

3. **A1 (pre-warm/gesture/`sources.size` guard) — PLausible but weaker.**
   - The unlock path only calls `output.play()` when sources exist (`remote-audio.service.ts:294-300`) while host `unlockAudioFromGesture`/recovery can run during source churn and/or without immediate peer stream: `room.page.ts:635-640`.
   - That can delay recovery but does not by itself explain why the app never reported blocked state in a stable non-playable scenario.

4. **A5 (single mixer output SPOF) — secondary architectural risk.**
   - One output element and one mixer destination carry all remote audio (`room.page.html:229-231`, `remote-audio.service.ts:538-542`, `321-326`).
   - If that path misroutes or stalls, everyone is silent.

5. **A6 (keepalive/auto-suspend confidence) — lower confidence.**
   - Keepalive path exists and is attached to destination (`remote-audio.service.ts:621-629`) but not directly proven as the decisive failure in this capture.

6. **A2 (pure autoplay suspend with running sources) — least likely for host signal.**
   - If sources were definitely present and context suspended, the banner branch at `room.page.ts:650-659` should have fired; host reported no banner.

## Q2 — Anomaly B verdict: SEQUENTIAL (B2) — proof file:line
From code, concurrent publishers are represented independently unless a peer leaves, so the one-at-a-time behavior matches session sequencing rather than a guaranteed map overwrite:
- `handleSfuPresence` only resubscribes new tracks for the **same client/session**, it does not reset the whole remote peer track map: `sfu-client.service.ts:933-955`.
- `subscribeNewRemoteTracks` computes new tracks by diffing previous/next and never clears existing maps: `sfu-client.service.ts:1051-1056`.
- `processOntrack` creates/gets stream per `entry.publisherClientId` and appends track; it never removes tracks for other publishers: `sfu-client.service.ts:804-827`.
- `midToEntry`/`subscribedTracks` are keyed by track entries and only removed for the departed client in `tearDownPeerSubscription`/`tearDownScreenSubscription`: `sfu-client.service.ts:974-992`, `1159-1176`.
- A hard overwrite would require a true mid collision across concurrent publishers (same mid reused), which would be server/SDP-level bad state rather than the normal code path.

## Q3 — Fix set: **patch-mixer** + R3 diagnostics convergence
I would converge on a mixer-hardening bundle (minimal surface-area, no architectural rewrite):

1. **Fix orphaned graph + source attach failure path** in `frontend/src/app/services/remote-audio.service.ts`.
   - `ensureGraph`: when `context` is `closed` (or before rebind), explicitly disconnect and null old `gain/limiter/destination/keepalive*` nodes, then rebuild the full chain so `this.gain.connect(this.limiter)` and `this.limiter.connect(this.destination)` always run from live nodes: `remote-audio.service.ts:507-535`.
   - `addSource`: stop swallowing sink-critical failures; on caught errors, advance a failure counter/force a diagnostics signal so recovery can trigger instead of invisible no-op: `remote-audio.service.ts:464-477`.
   - `recoverPlayback` / `rebuild` path should call `ensureGraph` and recover from source-map inconsistency by clearing and rebuilding sources before replay: `remote-audio.service.ts:328-344`, `328-340`.

2. **Tighten mixer recovery under no-sources and autoplay boundaries** in `frontend/src/app/pages/room/room.page.ts` and `remote-audio.service.ts`.
   - Change `remoteAudioBlocked` behavior to be source/version-driven but avoid dependence on silent no-source mute-out; keep banner tied to explicit `play()`/state mismatch evidence for mixer users: `room.page.ts:650-659`.
   - In `unlockAudioFromGesture`, call recovery immediately after `syncPeers` on a real user gesture path (not only timer-driven setTimeout path) and avoid relying on non-gesture timer side effect: `room.page.ts:635-640`, `2667-2673`.
   - Ensure `unlockAndPlayRemoteSinks()` attempts output binding/replay when sources appear after initial call, not just when `sources.size > 0` at call time: `remote-audio.service.ts:294-305`.

3. **Make sink routing explicit + observable** in `frontend/src/app/services/remote-audio.service.ts`.
   - Persist sink-apply result for output and all kickstarts; if output selection fails, include failure status in diagnostics rather than silently continuing: `remote-audio.service.ts:85-112`, `321-326`, `652-657`.
   - Keep existing fallback, but emit explicit fields for `selectedSinkId`, `sinkApplied`, and fallback attempt source.

4. **R3 diagnostics payload + fields (decode-vs-sink disambiguation).**
   - `frontend/src/app/services/meeting-sessions.service.ts`: extend `SfuInboundTrackStats` with media-playout metrics (`mediaPlayoutAudioLevel`, `mediaPlayoutConcealedSamples`, `mediaPlayoutTotalSamplesDuration`) and add host mixer snapshot fields (`remoteAudioContextState`, `remoteAudioMixerSources`, `remoteAudioOutputAttached`, `remoteAudioOutputPlaying`) to `DiagnosticsPayload`/`SfuDiagnosticsSnapshot` as appropriate: `meeting-sessions.service.ts:276-293`, `324-343`, `345-379`.
   - `frontend/src/app/services/sfu-client.service.ts`: collect `media-playout` stats in diagnostics snapshot and map them to the same remote track using `midToEntry` (in addition to `inbound-rtp`): `sfu-client.service.ts:714-754`.
   - `frontend/src/app/pages/room/room.page.ts`: include host mixer state in `buildDiagnosticsPayload()` and continue passing through diagnostics every sample: `room.page.ts:3491-3525`, `3477-3479`.

5. **Keep R3 interpretability tight for next call.**
   - If `audioLevel > 0` but media-playout totals flat and banner clear, suspect sink-route defect; if both inbound decode + playout are flat with context suspended/blocked, suspect playout graph/autoplay path; if both climb and no output remains, suspect output-level routing.

## New issues found this round (or "no new issue beyond R1")
no new issue beyond R1.

STATUS: AGREE — root cause stack is **A3 dominant with A4 as a high-confidence co-contributor**, B is **SEQUENTIAL (B2)** under normal code-path assumptions, and I would converge on the **patch-mixer hardening bundle** above with R3 diagnostics fields to make next-call attribution decisive.
