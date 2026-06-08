# sonnet CODE red-team CR9 (lens L9: privacy/perf/closure)

## Privacy/security of payload: OK

### What's new in the payload
Three additions carry device-id-level data:
1. `DiagnosticsPayload.selectedAudioOutputId` (raw string) — `room.page.ts:3519`
2. `RemoteAudioPlayoutDiagnostics.selectedAudioOutputId` + `effectiveSinkId` (raw strings) — `meeting-sessions.service.ts:711-712`
3. `remoteAudioPlayout.perPublisher[].sinkId` (raw string, the element's current sinkId) — `meeting-sessions.service.ts:724`

### Who owns these IDs?
All three are the **local participant's own** audio output device ID — not another participant's. Each client uploads only its own payload; none of these fields contain another participant's device ID. The `perPublisher[].sinkId` is the HOST's element sink repeated once per publisher entry (the host's own device routed to each publisher's element), not the remote participant's device.

### Cross-participant PII scan
`advertisedRemotePublisherDiagnostics()` (`room.page.ts:536–607`) includes remote `clientId`s and `advertisedAudioTrackNames`. Track names are internal SFU opaque strings (`audio-<uuid>` style), not user PII. No remote participant's IP, UA, or device ID appears in the host's payload.

### Display-layer redaction: correctly implemented
`redactedAudioOutputLabel()` (`diagnostics.page.ts:109–114`) — returns `'selected'`, `'default'`, or `'id#<6-hex-hash>'`, never the raw ID. Used in every sink display path in `buildRemoteAudioPlayoutRows` (`diagnostics.page.ts:122–153`). HTML template calls `remoteAudioPlayoutRows()` which delegates to `buildRemoteAudioPlayoutRows` — raw IDs never reach the template. `shortHash()` (`diagnostics.page.ts:190–197`) is a one-way FNV-1a hash; no preimage leakage.

### Server-gate dependency
The raw IDs DO go to the server in the uploaded payload. Privacy is sound **given the existing owner-only diagnostics gate** on the read-back endpoint. The patch does not change that gate (server code not in diff). If the gate holds: only the owner can read their own raw device IDs, which is acceptable. No change to that posture is required from the client side.

**Verdict: OK** — owner's own device IDs, display layer redacted, no cross-participant PII, owner-only server gate unchanged.

---

## Perf-at-scale: OK

### Registry-based approach eliminates DOM scans
Old `allSinksPlaying()` did `document.querySelectorAll('audio[data-remote-audio]')` on every call. New version iterates `this.registry.values()` — pure in-memory O(n). Same for `unlockAndPlayRemoteSinks`: old code scanned DOM; new code uses registry. `applySpeakerDevice` in `room.page.ts:2420` now explicitly excludes remote-audio elements (`audio:not([data-remote-audio])`) to avoid double-management.

### Per-publisher operations: all O(n)
- `syncPeers` diff: builds `nextIds` Set O(n), removes departed O(n), adds/checks incoming O(n). No nested loops.
- `refreshBlockedState()` (`remote-audio.service.ts:630–638`): spreads registry into array, calls `some`/`every` — O(n). Called frequently (on every entry state change) but for n ≤ 10 publishers this is ~20 comparisons per call.
- `applyOutputDevice`: `Promise.all([...registry.entries()].map(...))` — O(n) concurrent. No serialization.
- `replayRegistryElements`: same structure, O(n) concurrent.
- `playoutDiagnostics()`: one `[...registry.entries()]` spread → O(n) snapshot. Fine.
- `advertisedRemotePublisherDiagnostics()` (`room.page.ts:536`): `subscribedEntries.some(...)` called per advertised track per publisher. For 10 publishers × 2 tracks × 20 subscribed entries = ~400 comparisons per diagnostic snapshot. Negligible.
- `cloneTrackNameMap` in sfu-client: full clone on every `registerRemoteTrackName` call. For 10 publishers × 2 tracks each, this is 20 small-map clones during connection setup. Fine — not per-render.

### Timer/element growth
Each remote publisher creates exactly ONE `<audio>` element appended to `document.body`. `destroyRegistryElement` (`remote-audio.service.ts:618`) removes listeners, pauses, nulls srcObject, calls `.remove()`. No accumulation between peers.

**Verdict: OK** — no O(n²), no per-render DOM scans, bounded element count.

---

## FINAL closure: does the EXACT JROM scenario now resolve to "host hears both on selected device, honest diagnostics"?

### Root cause (confirmed in this diff)
The old `WebAudio mixer → MediaStreamAudioDestinationNode.stream → single <audio> element → setSinkId` chain is unreliable: `setSinkId` on an element backed by a Web-Audio `MediaStreamAudioDestinationNode` stream is a known cross-browser weakness — the browser may route to the default output regardless of the specified sinkId. With JROM's non-default selected speaker, audio was decoded correctly (RTP arrived 0 loss) but never reached his selected output. `mixerEnabled()` now returns `false` — the entire Web-Audio graph is gone.

### Fix trace for JROM's exact scenario

1. **Per-publisher `<audio>` elements** (`addPublisher`, `remote-audio.service.ts:390–543`):
   - `el.srcObject = stream` — the raw `MediaStream` from WebRTC, not a Web-Audio destination stream.
   - `setSinkId` on an element backed by a live `MediaStream` is well-supported and is exactly the approach Google Meet uses.
   - `applyVolumeState(el)` sets `el.volume = 1.0, el.muted = false` before play.

2. **Selected device applied to each element**:
   - `applyOutputDevice(selectedDeviceId)` (`remote-audio.service.ts:284–305`) iterates ALL registry entries and calls `applySinkId(entry.el, deviceId)` for each.
   - For Peer2-Win's element: `setSinkId(JROM's selected device ID)` — on a direct MediaStream element, succeeds.
   - For Peer2-phone's element: same.
   - `this.selectedSinkId` persists so new publishers added mid-call also receive the right sink.

3. **Concurrent publishers** (R2):
   - Registry keyed by peer ID. Peer2-Win and Peer2-phone have separate peer IDs → separate entries.
   - `syncPeers` adds both independently, neither evicts the other.
   - SFU-level mid-conflict path: `bindSubscribedMid` + `LiveMidConflictError` + `scheduleLiveMidConflictRenegotiationRetry` handles the case where two subscribe calls conflict on an SDP m-line, retrying with `forceRenegotiation: true`. The previous "one-publisher-at-a-time" behaviour (Anomaly B) is addressed here and at the roster level.

4. **Result**: JROM hears BOTH publishers through his selected speaker. ✓

### R3 diagnostics closure
- `totalAudioEnergy` added to `SfuInboundTrackStats` and parsed from `getStats` (`sfu-client.service.ts:982`). Previously null.
- `media-playout` stat type now extracted into `SfuDiagnosticsSnapshot.mediaPlayout` (`sfu-client.service.ts:989–1002`). Previously absent.
- `playoutDiagnostics()` (`remote-audio.service.ts:397–422`) exposes per-publisher: `paused`, `muted`, `volume`, `sinkId`, `blockedReason`, `sinkApplyResult`, `sinkApplyTimedOut`, `srcObjectAttached`, `readyState`.
- `buildRemoteAudioPlayoutRows` in diagnostics page joins per-publisher playout state with `inboundTracks` audioLevel/totalAudioEnergy by publisherClientId + trackName.
- A future call's diagnostics row alone is now sufficient to localize failure: sinkApplyResult distinguishes sink routing failure from autoplay block from voice stall. ✓

### Any residual path to the original symptom (received-but-silent, no banner)?

**`AbortError` on `el.play()` — intentional design, not the JROM path.**
`classifyPlaybackFailure` returns `'aborted'` for `AbortError`; `remoteAudioBlockingReason` (`remote-audio.service.ts:648–654`) returns `null` for any non-null `playbackFailure`, so no banner is set. This means a transiently AbortError-rejected element is treated as "not blocked" — intentional, because: (a) `AbortError` is transient (srcObject change, competing load), `isEntryCurrent` guards stale-entry abort cases, (b) the keepalive `replayRegistryElements` retries play on the live entry. If play succeeds on retry, `entry.blocked = false`, `entry.playbackFailure = null`, `remoteAudioBlocked` clears. This is not the JROM path (JROM's call was post-gesture, AudioContext running per evidence).

The true-autoplay case (`NotAllowedError`) falls through `classifyPlaybackFailure` as `null` → `entry.blocked = true` → `remoteAudioBlockingReason` returns `'autoplay'` → banner shows correctly. ✓

**No other residual path to received-but-silent-no-banner** is present for the JROM scenario (selected non-default speaker, post-gesture, running context). The elimination of the Web-Audio mixer is the definitive fix.

---

## NEW bugs: none

| # | File:line | Severity | Description |
|---|-----------|----------|-------------|
| — | — | — | None found |

One **trivial dead-conditional** in `setVolume` (`remote-audio.service.ts:248`): both branches of `if (forcePersist || clamped !== value) ... else ...` call `persistVolume(clamped)`. No functional impact — always persists, which is correct behaviour.

`combineSinkApplyResults` is conservatively ordered (`failed` dominates all). For a 5-publisher call where 1 publisher's sink fails and 4 succeed, `applyOutputDevice` returns `'failed'` → `selectedSpeakerUnavailable` set → error message shown. This is intentionally conservative (alert rather than ignore partial failure); not a bug, but worth noting as a possible UX false-alarm in noisy environments.

---

STATUS: CLEAN — private/scales/closed
