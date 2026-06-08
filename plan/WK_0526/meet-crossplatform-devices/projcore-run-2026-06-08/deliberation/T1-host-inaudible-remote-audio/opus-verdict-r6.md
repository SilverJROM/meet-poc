# opus verdict — T1 round 6

## Q1 — B13-B16 correct & sufficient
- **B13 (no autoplay attr):** correct AND necessary. One sharpening: assigning `srcObject` does NOT auto-start playback (unlike `src`+autoplay), so removing the attribute + service-controlled `play()` after sink is race-free. Confirmed sufficient.
- **B14 (clearRegistry in reset):** correct. Ordering: clearRegistry BEFORE clearSources is fine; guard against an in-flight addPublisher by making addPublisher check an `isResetting`/disposed flag (or that the service still in-call) before append — else a late ontrack during teardown re-creates an element. Add that guard.
- **B15 (volume migration):** correct; must handle first-run (no stored value → DEFAULT 1.0) and NaN → 1.0. Safe.
- **B16 (FIX-C payload):** sufficient IF it includes the decisive field set: per-publisher `{paused, muted, sinkId, srcObjectAttached, readyState}` + the `media-playout` `{audioLevel, totalAudioEnergy}` + `selectedAudioOutputId`. The PROOF tuple for "decoded AND audible on selected sink" = `media-playout.totalAudioEnergy rising` AND `element.paused=false` AND `element.sinkId == selectedAudioOutputId`. Specify that tuple so the next call is unambiguous.

## Q2 — Contradiction check + exact ordered addPublisher
No contradictions: single source of truth = service signals `volume`, `mutedAll`, `selectedSinkId`, `unlocked`. Both addPublisher and setVolume/setMutedAll READ them; deterministic order below.

**addPublisher(id, stream):**
1. If `disposed`/not-in-call → return (B14 guard).
2. If registry.has(id): reuse entry; if `el.srcObject !== stream` set it; skip create. (dedup — B4, rejoin race)
3. Else create `el = document.createElement('audio')`; set `data-remote-audio`, `playsinline` — **NO `autoplay` attr** (B13).
4. `el.srcObject = stream`.
5. `el.muted = mutedAll()` ; `el.volume = mutedAll() ? 0 : min(volume(),1)` (B1/B3).
6. `await applySinkId(el, selectedSinkId())` — BEFORE play (B9).
7. If new: `document.body.append(el)`.
8. If `unlocked()`: `await el.play()` → on reject set blocked + banner. Else: leave paused, set banner (plays on next unlockAll/interaction — B12).
9. `registry.set(id, {stream, el})`.
setVolume/setMutedAll/unlockAll/applyOutputDevice iterate `registry` applying the same fields. Recovery (B6/B7) = re-step 6+8 per element.

## Q3 — Silence hunt (post design-v2)
| Path | Banner fires? | Auto-recovery? | Silent-no-banner blocker? |
|------|---------------|----------------|----------------------------|
| Autoplay-blocked (any join order) | YES (B8: registered el paused) | unlockAll on gesture / interaction-recovery | NO |
| Background→resume pauses elements | YES (paused) | B6/B7 + pointerdown/click recovery | NO |
| sinkId device unplugged / BT handoff mid-call | YES if play stalls | devicechange → ensureSelectedAudioDevice + fallback('') | NO |
| setSinkId fails (bad/stale id) | only if play also fails | fallback to '' default (audible, since other apps work) | NO (degrades to default device) |
| All publishers muted remotely / publisher sends silence | NO | n/a — CORRECT behavior, not a bug | NO (not a defect; diagnostics show micSilent) |
| **setSinkId UNSUPPORTED browser + non-default selected** | NO (element plays fine to DEFAULT) | n/a | EDGE: plays to default, not the selected device — "wrong device" not "no audio". Out of scope for JROM (Chrome supports setSinkId). Documented caveat, pre-existing, not introduced by this fix. |
No remaining SILENT-WITH-NO-BANNER path in JROM's environment (Chrome, setSinkId supported, default device audible). The original bug class is closed by B8 (banner on any paused registered element) + the registry making "decoded but routed nowhere" impossible (direct-stream element + explicit sink).

## Q4 — new item(s)
- Minor: add the B14 `disposed` guard to addPublisher (above) — small but real; counts as a refinement of B14, not a new mechanism.
- Documented caveat (NOT a blocker, pre-existing): setSinkId-unsupported browsers route remote audio to the default output regardless of selection.
- No new silent-no-banner mechanism.

STATUS: AGREE — design v2 is complete for JROM's environment; B13-B16 correct with the B14 disposed-guard sharpening + the B16 proof-tuple spelled out; the ordered addPublisher sequence resolves B1/B3/B9/B13 race-free; no silent-no-banner path remains. (setSinkId-unsupported-browser is a documented pre-existing caveat, out of scope.)
