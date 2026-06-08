# opus CODE red-team CR5 (lens L5: adversarial inputs / browser quirks / error paths)

## Findings by probe
1. **setSinkId-unsupported (iOS Safari/Firefox):** `!withSink.setSinkId → return 'selected'` (remote-audio.service.ts:135). Audio plays to the system default (browser can't route); no crash. Borderline-honesty note: it reports 'selected' though no routing occurred → diagnostics could read 'selected' on a browser that ignored it. MOOT for JROM (these browsers expose no audiooutput selection, so selectedAudioOutputId is empty/default), but for cross-browser honesty consider a distinct 'unsupported' result. NOT a functional bug.
2. **Garbage/missing RTCStats:** `remoteVoiceSample` guards `typeof !== 'number' || !Number.isFinite` → returns null → watchdog `clearVoiceStalls` + return. NaN/undefined/negative/huge all handled: negative/0 bytes won't satisfy `last > first` (no false stall); audioLevel/totalAudioEnergy coerced via `?? null`. ROBUST. No crash, no NaN-propagation, no false stall.
3. **Autoplay variants:** play() rejection (any error type) → catch → blocked=true → banner; gesture recovery replays `[data-remote-audio]`. Blocked vs error both route to the banner. OK. (NotAllowedError vs others aren't differentiated, but both correctly show the banner — acceptable.)
4. **Weird device enumeration:** empty/stale/duplicate selectedAudioOutputId → setSinkId path → 'default-fallback'/'failed' surfaces selectedSpeakerUnavailable; devicechange re-applies via applySpeakerDevice. No crash.
5. **Degenerate streams:** 0 audio tracks → `currentAudioTrack` returns null → addPublisher `if (!track) return` (no element). MINOR (low, pre-existing): if ALL tracks are 'ended', currentAudioTrack falls back to `tracks[0]` (an ended track) → addPublisher creates an element whose `track 'ended'` listener won't re-fire → a brief orphan element playing a silent ended track until the next syncPeers replaces it with a live track. Self-heals; pre-existing behavior, not introduced by this fix. Optional hardening: skip addPublisher when the chosen track.readyState==='ended'.
6. **Diagnostics payload robustness:** diagnostics.page uses `playout?.perPublisher ?? []`, `?? null`, optional chaining (107-133, 529, 536) → old rows missing the new fields render without throwing. ROBUST + backward compatible.
7. Nothing else surfaced under this lens.

## NEW bugs
None blocking. Two borderline MINOR observations (iOS setSinkId reports 'selected'; ended-track-at-add brief orphan) — both pre-existing / out-of-scope for JROM's environment, optional hardening at most.

STATUS: CLEAN — adversarial inputs and error paths are well-guarded (NaN→null, optional-chaining diagnostics, no-track→no-add, sink-fallback honest); the two minor notes are non-blocking/pre-existing. Vote toward streak 1/3 (lens L5).
