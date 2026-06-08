# Haiku verdict — T1 round 6

## Q1 — B13-B16: correct & sufficient?

| Item | Requirement | Correct? | Sufficient? | Gap |
|------|-------------|----------|-----------|-----|
| **B13** | NO autoplay attr; service-exclusive play() after srcObject+volume+mute+setSinkId | ✓ YES | ✓ YES | None — prevents native autoplay racing before setSinkId (A4 re-intro blocked). |
| **B14** | reset() calls clearRegistry() before clearSources(); removes elements from DOM + null srcObject | ✓ MOSTLY | ⚠ RACE GAP | What if addPublisher(id, stream) is in-flight while reset() is running? clearRegistry() clears the map, but addPublisher might be simultaneously appending el to DOM and registering it. Result: orphaned element, leaks, potential double-create. **Gap:** no synchronization or enqueue protection. See Q2 contradiction below. |
| **B15** | migrate stored volume to min(parsed, 1); cap slider to 100% | ✓ YES | ✓ YES | Migration on startup prevents 1.3 mismatch. No gap. |
| **B16** | FIX-C payload: selectedAudioOutputId + unlocked + blockedPeerIds[] + perPublisher{sinkId, audioLevel, totalAudioEnergy} | ✓ YES | ⚠ CONDITIONAL | Sufficient to prove selected-output playout IF all fields populate. But: what if media-playout audioLevel is still null (no AudioContext destination to measure)? Consensus says keep diagnostics unchanged (FIX-C), but doesn't confirm media-playout is available with Option A (no AudioContext). If media-playout is unavailable, audioLevel is forever null → can't prove A4 was fixed. **Gap:** need to confirm media-playout stats are available independent of AudioContext, or accept that proof is probabilistic (climbing totalAudioEnergy + sinkId === selectedId is "likely" delivered, but not definitive). |

**Verdict on B13-B16:** B13, B15 are solid. B14 has a race-condition gap (reset + addPublisher sync). B16 has a diagnostics-proof gap (media-playout availability without AudioContext).

---

## Q2 — Internal contradiction check + exact ordered addPublisher sequence

**Contradiction audit (B1-B16):**
- Volume set in setVolume() AND addPublisher()? **NO contradiction.** service.volume is the source of truth; setVolume updates it + iterates all elements. addPublisher reads service.volume() signal and applies it to the new element. Single source, deterministic order.
- Mute set in setMutedAll() AND addPublisher()? **NO contradiction.** Same pattern as volume.
- setSinkId called in addPublisher AND applySpeakerDevice? **NO contradiction.** addPublisher calls once on create; applySpeakerDevice calls again on device change. Both are correct.
- play() called in addPublisher AND unlockAll() AND interaction-recovery? **CORRECT.** addPublisher attempts play() (may be blocked); unlockAll() replays all on gesture; interaction-recovery replays on input event. Redundant calls are harmless (play() on already-playing element succeeds).
- remoteAudioBlocked set in addPublisher rejection AND effect on any-el-paused? **Potential inconsistency.** addPublisher emits blocked on play() failure (via remoteAudioBlocked.emit()). The room effect at room.page.ts:650-659 sets blocked based on contextState + outputPlaying. With Option A (no context), how is blocked set? The consensus doesn't explicitly wire addPublisher.emit(blocked) to room.remoteAudioBlocked.set(). **Possible gap:** is the blocked signal consistently driven?

**Exact ordered addPublisher(publisherClientId, stream) sequence** (satisfies B1+B3+B9+B13):

1. **Deduplicate:** Check if publisherClientId already in registry; if yes, removePublisher first (clean slate for rejoin).
2. **Create element:** `el = document.createElement('audio'); el.setAttribute('data-remote-audio', ''); el.setAttribute('playsinline', '');` (NO autoplay)
3. **Assign stream:** `el.srcObject = stream;`
4. **Apply volume:** `el.volume = mutedAll ? 0 : Math.min(volume, 1);` (read from service.volume(), service.mutedAll() signals)
5. **Apply mute:** `el.muted = mutedAll;`
6. **Apply sink (atomic, before play):** `await setSinkId(el, selectedAudioOutputId, {defaultFallback});` (must complete or throw before next step)
7. **Append to DOM:** `document.body.appendChild(el);` (or a designated container; consensus doesn't specify)
8. **Register:** `registry.set(publisherClientId, {stream, el});` (now trackable for cleanup)
9. **Attempt play (gesture or unlocked context):** `el.play().catch((err) => { remoteAudioBlocked.set(true); });` (if play() fails, set blocked flag)

**Critical ordering enforced:** steps 3-6 are atomic (srcObject → volume → mute → sink) before step 9 (play). This prevents A4 (setSinkId racing before play).

**Critical gap from B14:** steps 1-9 can race with reset().clearRegistry() running concurrently. If reset() is called from an effect on state='not-in-call' WHILE addPublisher is at step 7 (appending), the element is appended but registry is cleared, leaving an orphan element in DOM.

**Fix needed:** enqueue addPublisher/removePublisher/clearRegistry through a single queue (like the sfu-client does), or add a lock/flag preventing reset() while any add is in-flight.

---

## Q3 — Silence hunt: every remaining path to silent remote audio

| # | Path | Host hears silence? | Banner fires? | Auto-recovery? | SILENT-NO-BANNER? | Notes |
|----|------|-------------------|--------------|----------------|------------------|-------|
| 1 | getUserMedia perm denied (local) | N/A | — | — | — | Only affects host's outbound, not remote inbound. Skip. |
| 2 | Output device permission denied | Unlikely; no permission model for audio output in browsers | — | — | — | Skip. |
| 3 | **OS exclusive audio device** | YES (another app owns speaker) | NO (element.paused=false, no banner trigger) | NO (OS-level mute) | **YES — BLOCKER** | Host foregrounds mail app → OS gives exclusive control to mail → remote audio element plays but OS mutes it. No visible indication. |
| 4 | **SinkId deviceId stale** (device unplugged) | MAYBE | Depends on setSinkId error handling | Maybe (if recovery re-tries) | **YES if setSinkId error not detected** | User unplugs USB headphones. selectedAudioOutputId is stale. setSinkId fails. **Gap:** does service catch setSinkId() rejection? Consensus says "default-fallback" but B13 doesn't show catch. If setSinkId throws and is unhandled, element remains but sinkId is unset → plays on default. Or if setSinkId swallows error and returns false, is blocked flag set? Consensus doesn't specify. |
| 5 | **All remoteAudio muted by app** | YES (el.muted=true, el.volume=0) | NO (no play() failure, no paused check catches muted) | NO (requires user action) | **YES — BLOCKER** | Host calls remoteAudio.setMutedAll(true) for some reason, forgets. All elements silent. No banner. Host thinks remote audio is broken. |
| 6 | Remote publishers send no audio tracks | Unlikely (peers joined with audio) | YES (registry empty → hasSources=false → no blocked banner, but diagnostic would show) | N/A | NO (would show "no sources" diagnostically) | Skip (edge case, not a host-side bug). |
| 7 | **Host tab is in background** | YES (browser throttles audio) | NO (element not paused, browser just mutes OS output) | NO (requires foreground) | **YES — BLOCKER** | Host is in a different tab. Remote audio element is playing, sinkId applied, but OS doesn't feed audio to speaker because tab is backgrounded. No banner (element state says "playing"). |
| 8 | **Publisher's audio track undecodable** | YES (track exists but codec/corruption) | NO (track exists, ontrack fires, addPublisher called, element plays but decodes nothing) | NO (publisher-side issue) | **YES — BLOCKER** | Publisher sends an audio track that the browser can't decode. addPublisher succeeds, banner doesn't fire (no rejection), but no audible output. |
| 9 | **addPublisher never called for a peer** | YES (registry empty for that peer) | NO (if no registry entry, hasSources=false, so no blocked banner for that peer specifically — but if ANY peer exists, the multi-peer banner situation is complex) | NO | **YES if wiring is missing** | The room effect watching remoteStreams must call service.addPublisher(). If this effect is not wired, peers join but don't get registry entries. **Gap:** consensus doesn't explicitly show where addPublisher is called (should be in room.page.ts effect watching remoteStreams). |
| 10 | **setSinkId promise hangs** | YES (addPublisher waits forever on setSinkId, never reaches play()) | NO (no error thrown, no blocked flag set) | NO (stuck promise) | **YES — BLOCKER** | await setSinkId() at step 6 of addPublisher hangs. play() at step 9 never executes. Element lives in DOM, paused, no audio. No banner (play() was never called). **Gap:** no timeout on setSinkId. Browser can hang on setSinkId indefinitely if device enumeration is slow. |
| 11 | **reset() + addPublisher race** | MAYBE (orphaned element may or may not play) | Undefined (race) | Maybe (recovery sees orphaned element?) | **YES if orphaned element is skipped** | reset() clears registry while addPublisher is appending el. el ends up in DOM but not in registry → recovery doesn't know about it → stays paused. **Gap (from B14 analysis).** |
| 12 | **Element.play() promise rejection not handled** | YES (if catch is missing) | Depends on error handling | Maybe (watchdog?) | **YES if error is swallowed** | addPublisher calls el.play().catch(...), but what if the catch is missing? play() promise rejects, exception thrown, no blocked flag set. **Gap:** consensus shows catch in B13 but doesn't confirm it's in place everywhere play() is called (unlockAll, recovery methods). |

**SILENT-NO-BANNER blockers found: items 3, 4, 5, 7, 8, 9, 10, 11, 12**

**Critical gaps:**
- **Item 3 (OS exclusive audio):** Environmental, hard to prevent. No fix.
- **Item 4 (stale sinkId):** Need explicit setSinkId error handling and blocked flag on rejection.
- **Item 5 (mute-all forgotten):** UI issue, need clearer mute indicator. Document it.
- **Item 7 (tab backgrounded):** Environmental, browser policy. No client-side fix.
- **Item 8 (undecodable track):** Publisher-side, but host could detect (check readyState in R3 diagnostics).
- **Item 9 (addPublisher not wired):** CRITICAL — need explicit room effect watching remoteStreams and calling service.addPublisher(). This is NOT in consensus v2.
- **Item 10 (setSinkId hangs):** Add timeout to setSinkId call.
- **Item 11 (reset race):** Add enqueue/lock to prevent concurrent reset + add.
- **Item 12 (play() catch missing):** Audit all play() calls have error handling.

---

## Q4 — New issues found

**Issue 17: addPublisher not explicitly wired — remoteStreams changes must trigger addPublisher calls (critical implementation gap).**
- consensus-r4-registry.md doesn't say where/when addPublisher(clientId, stream) is called
- It should be: `effect(() => { for (const [id, stream] of sfuClient.remoteStreams()) addPublisher(id, stream); })`
- **Without this wiring, peers join but registry stays empty → all silent.**

**Issue 18: setSinkId error handling and timeout.**
- B13/B9 assume setSinkId completes before play(), but no timeout is specified
- If setSinkId hangs (device enumeration slow), play() never executes
- Need: `await Promise.race([setSinkId(...), timeout(5000)])`
- **Without timeout, new peer hangs indefinitely.**

**Issue 19: reset() + addPublisher race (confirmed from B14 analysis).**
- clearRegistry() clears map while addPublisher is appending el
- Orphaned elements not in registry → not played by recovery
- Need: enqueue(clearRegistry) and enqueue(addPublisher) so they never overlap

**Issue 20: setMutedAll(true) creates a silent-no-banner path.**
- No UI indicator that remote audio is muted
- If host accidentally calls setMutedAll(true), all remote audio is silent, no banner
- Need: mute-all indicator in controls-bar (e.g., "Mute All" button visual state)

**Issue 21: FIX-C diagnostics — media-playout audioLevel undefined without AudioContext.**
- Consensus says keep FIX-C diagnostics unchanged, but with Option A (no AudioContext), media-playout stats may not populate
- audioLevel will still be null on the next call if no AudioContext destination exists
- Need: verify media-playout stats work without Web-Audio destination, or accept probabilistic proof

---

STATUS: REVISE — **Design v2 fixes A3/A4 and closes most of B1-B12, but 5 CRITICAL gaps remain that recreate SILENT-NO-BANNER paths (original bug class): (1) addPublisher not wired to remoteStreams, (2) setSinkId no timeout, (3) reset-addPublisher race unprotected, (4) setMutedAll(true) creates silent-no-indicator, (5) FIX-C diagnostics may not prove selected-device playout (audioLevel undefined). Do NOT ship without: explicit remoteStreams→addPublisher wiring in room.page.ts effect, setSinkId timeout, enqueue protection on reset+add, mute-all UI indicator, confirmation that media-playout stats populate with Option A. These are implementation details, not design changes, but their absence re-introduces the original failure mode on the next real call.**
