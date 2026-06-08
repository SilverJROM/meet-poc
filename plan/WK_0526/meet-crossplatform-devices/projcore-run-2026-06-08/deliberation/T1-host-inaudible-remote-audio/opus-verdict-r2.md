# opus verdict — T1 round 2

## Q1 — A-mechanism ranking vs host evidence (no banner + silence + specific device + other-apps/Meet audible)
The banner effect EARLY-RETURNS when `hasSources` is false (room.page.ts:657: `if (!mixerEnabled || !hasSources) return`) and otherwise sets `remoteAudioBlocked = !(contextState==='running' && outputPlaying)` (L658-659). This is the master discriminator:

| Rank | Mechanism | Would it show a banner? | Fits "no banner + silence"? |
|------|-----------|--------------------------|------------------------------|
| **1** | **A4 — sinkId/output routing**: context running, `output.play()` resolved (outputPlaying=true) → `playing=true` → banner FALSE; but `setSinkId(selectedDeviceId)` routes the mixer-destination stream to a device that doesn't emit (stale id → '' fallback to a non-expected default, OR a valid-but-silent endpoint) | NO banner | **YES** — and uniquely consistent with "I had selected a specific output device" |
| **1=** | **A3 — orphaned graph**: `ensureGraph()` rebuilds AudioContext after `closed` but reuses old gain/limiter/destination → `addSource` connect throws InvalidStateError, swallowed (remote-audio.service.ts:466-478,508-535) → sources.size stays 0 → `hasSources=false` → banner SUPPRESSED, silent | NO banner | YES — but requires a prior context `closed` event, which is uncommon on a desktop host (more an iOS/backgrounding trigger). Lower prior for JROM's desktop seat. |
| 3 | A1 — gesture-guard (`sources.size>0` skips output.play pre-warm, L294) | **YES** (sources>0 added on peer arrive, outputPlaying=false → banner) | **NO — contradicted by no-banner** |
| 4 | A2 — pure autoplay-suspend with sources>0 | **YES** (hasSources + not running → banner) | **NO — contradicted by no-banner** |
| 5 | A5 SPOF (architectural framing of A1/A3/A4), A6 keepalive-gain-0 (contributing, not primary) | n/a | background |

**Conclusion:** no-banner DEMOTES A1/A2 (they would have shown the banner) and PROMOTES **A4 (sink-routing)** as the single best fit for JROM's desktop seat, with **A3** the close second (and the likely culprit on iOS/mobile hosts). Both A1 and A2 are still REAL bugs that would bite other seats — fix them anyway.

## Q2 — Anomaly B verdict: SEQUENTIAL (B2) for THIS call, with B1 as a real latent bug
Proof from code (sfu-client.service.ts):
- Renegotiation branch filters to NEW mids only (`!existingMids.has(m)`, L1720-1722) and reconciles via `reconcileSubscribedMids` → existing publisher-A mids preserved. No displacement here.
- `processOntrack` (L804-829) is per-publisher-additive; never removes A when B arrives.
- The ONLY displacement path is the no-reneg branch L1749-1755: `midToEntry.set(rt.mid, B-entry)` — this overwrites A's entry ONLY IF CF returns a mid for B that COLLIDES with A's existing mid. That is conditional on CF mid reuse, not unconditional.
- Evidence timeline shows a ~7s GAP between peer2(Win) ending (~08:26:45) and phone starting (~08:27:00) → consistent with B2 sequential sessions, not concurrent displacement.
- **DECISIVE:** JROM heard NEITHER publisher even when each was individually subscribed with RTP climbing (peer2 0→194KB solo, then phone 0→86KB solo). So anomaly A (playout) ALONE explains the failure; B is NOT required and is NOT the "hears nobody" cause.
→ Verdict: B = SEQUENTIAL for this call (B2). BUT add a defensive guard at L1753 refusing to overwrite an existing mid owned by a different publisher (cheap insurance against the latent B1 collision) + a 2-concurrent-publisher test. Not on the critical path for R1.

## Q3 — Fix set: PER-PUBLISHER UNMUTED ELEMENTS (Meet-style) + keep mixer optional + R3 diagnostics
Recommend the architectural fix because it dissolves A1/A3/A4/A5 simultaneously and matches the working reference (Meet):
1. **Primary — per-publisher audible `<audio>` elements.** For each remote publisher, attach its stream to its OWN unmuted `<audio autoplay playsinline>` element (not muted kickstart), apply `setSinkId(selectedDeviceId)` per element with the existing default-fallback. Remove the single-shared-mixer-element dependency for AUDIBILITY (mixer may remain for the volume/limiter/meter, but audibility must not hinge on it). Closes A3 (no single Web-Audio graph SPOF), A1 (each element plays on the join/recovery gesture), A5. — remote-audio.service.ts createKickstartElement→make audible; bindOutputElement.
2. **Sink robustness (A4).** On `setSinkId` failure clear BOTH localStorage AND the in-memory `selectedAudioOutputId` signal (sonnet C4); after fallback to '' verify the element is actually producing (outputPlaying). — remote-audio.service.ts:652-657 + room.page.ts wiring.
3. **Graph rebuild safety (A3).** In `ensureGraph()` null `gain/limiter/destination` when the context is recreated so fresh nodes bind to the new context. — remote-audio.service.ts:508-512.
4. **Gesture pre-warm (A1).** Drop the `sources.size>0` guard so the join gesture pre-warms `output.play()`. — remote-audio.service.ts:294.
5. **B guard (latent B1).** Refuse cross-publisher mid overwrite at L1753 + 2-concurrent-publisher test.
6. **R3 diagnostics (the definitive instrument).** Capture `media-playout` audioLevel/totalAudioEnergy/totalSamplesDuration (Chrome 113+ moved them here — explains the nulls), inbound `totalAudioEnergy`, emit host `remoteAudioContextState`, per-publisher output-element paused/muted/sinkId. → next call row localizes decode-vs-sink unambiguously.

## New issues found this round (beyond R1)
- (confirm) Banner is structurally BLIND to the sources=0 failure mode (room.page.ts:657 early-return) — a silent-failure with no user signal. Worth an explicit "remote audio engine failed to start" surfaced state even when hasSources=false but peers exist with inbound RTP.
- The per-publisher-element fix ALSO removes the banner-blindness because each element's paused state is directly observable.

STATUS: AGREE — Primary root cause is the host playout path failing SILENTLY to deliver to the selected output device (A4 sink-routing top, A3 orphaned-graph second; A1/A2 ruled down by no-banner but still real). Anomaly B is sequential here (B2) with a latent overwrite to guard. Commit the per-publisher-unmuted-element fix bundle + sink robustness + graph-rebuild null + gesture pre-warm + R3 media-playout diagnostics.
