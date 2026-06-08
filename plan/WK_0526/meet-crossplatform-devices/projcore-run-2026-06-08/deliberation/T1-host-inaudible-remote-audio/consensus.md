# T1 — host-inaudible-remote-audio — CONSENSUS (round 2, 2026-06-08)

## Decision (root cause + fix, the goal's terms)
**Root cause = the HOST playout path fails SILENTLY to deliver remote audio to the selected output device.** Two confirmed mechanisms in a stack (the data can't fully separate them without a fresh instrumented call, and BOTH are real defects):
- **A4 — sink/output routing:** all remote audio is mixed through ONE Web-Audio `MediaStreamAudioDestinationNode` → ONE `<audio>` element, then `setSinkId(selectedDevice)` is applied. With a NON-default device selected this routing is fragile/unreliable → audio goes to the void while OS/other apps (Meet) stay audible. Best fit for JROM's "specific device selected + no banner".
- **A3 — orphaned Web-Audio graph:** `ensureGraph()` rebuilds the AudioContext after `closed` but REUSES old gain/limiter/destination nodes → `addSource().connect()` throws `InvalidStateError`, swallowed (remote-audio.service.ts:466-478,508-535) → sources.size stays 0 → banner SUPPRESSED (room.page.ts:657 early-returns when `!hasSources`) → silent with no indicator.
- A1 (gesture `sources.size>0` guard) + A2 (autoplay-suspend) are REAL but **ruled DOWN by JROM's "no banner"** (they'd have shown a banner) — fixed anyway as defense-in-depth.

**Anomaly B = SEQUENTIAL (B2), NOT suppression.** The friend's Windows PC went offline (~08:26:45), the phone joined after a ~7s gap; `processOntrack` is additive (never evicts). JROM heard NEITHER publisher even when each was individually subscribed with clean RTP → the playout bug alone explains the failure. The only displacement path is a conditional CF mid-collision overwrite (sfu-client.service.ts:1753) → add a defensive guard. **Per JROM's 2026-06-08 directive, the app must never suppress any voice; this guard PREVENTS dropping a concurrent publisher — no talker-limiting is added.**

## Fix (unanimous direction; 4/6 architectural, 2/6 patch-first but agree per-publisher is correct)
**Primary — Meet-style per-publisher UNMUTED `<audio>` elements.** KEY: this path ALREADY EXISTS in `TileComponent` (tile.component.html:14-15, tile.component.ts:56-66) and is currently DISABLED by `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` (room.page.html:253/273/293). So the fix is largely RE-ENABLING the existing per-publisher audible path and retiring the single mixer from the AUDIBLE path. Dissolves A1/A3/A4/A5 at once:
1. Stop forcing tiles off: remove `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"` so each remote tile's own `<audio data-remote-audio srcObject=stream>` is the audible path (everyone heard concurrently — satisfies R2 + the no-suppression directive).
2. Retire the single shared mixer output `<audio>` from the audible path (room.page.html:229-230; remote-audio.service.ts bindOutputElement/addSource graph). Keep mixer ONLY if needed for volume/limiter, never as the sole audible path.
3. `setSinkId` AFTER `srcObject` per element, with the existing default-fallback; the existing `applySpeakerDevice()` (room.page.ts:2648-2658) already reapplies sinkId across all media elements → device routing survives the switch.
4. Keep the existing per-publisher play-on-gesture/recovery (`audio[data-remote-audio]` unlock loop already present, remote-audio.service.ts:282-292).
5. Hardening even if any graph remains: null gain/limiter/destination on context rebuild (A3); drop the `sources.size>0` pre-warm guard (A1); clear in-memory `selectedAudioOutputId` on sinkId failure (A4/C4).
6. **B guard:** refuse cross-publisher mid overwrite at sfu-client.service.ts:1753 + add the missing 2-concurrent-publisher regression test (sfu-client.spec.ts).

## R3 diagnostics (unanimous — the definitive next-call instrument)
- Collect `media-playout` stats (audioLevel, totalAudioEnergy, totalSamplesDuration) — Chrome 113+ moved these here; current collector reads only `inbound-rtp.audioLevel` (sfu-client.service.ts:728-754) → explains the null capture.
- Add inbound `totalAudioEnergy`, `jitterBufferEmittedCount` exposure, receiver track readyState/muted/enabled per mid.
- Emit host playout state in the payload: `remoteAudioContextState`, selected output id, per-publisher element paused/muted/sinkId/srcObjectAttached (from debugSnapshot()).
- Interpretation key: emitted climbing + media-playout.audioLevel>0 → reaching OS output → sink defect; emitted climbing + audioLevel=0 → decoded-not-played → context/graph; both flat → suspended+buffering. One future row becomes decisive.

## Dissent (non-blocking)
- spark + haiku preferred a "patch-mixer-now" bundle over the architectural switch (lower surface area), but BOTH agree per-publisher elements are the correct end state (haiku: "medium-term migrate"). Since the per-publisher path already exists in code, the architectural switch is low-risk → majority + opus settle on it. The patch-mixer hardening items (A3 null-nodes, A1 guard, sink clear) are FOLDED IN as belt-and-suspenders.

## App-bugs surfaced → queue (atomic slices, all [FIX])
- FIX-A: Re-enable per-publisher audible audio + retire single-mixer audible path (R1, R2 — host hears everyone).
- FIX-A2: A3 null-nodes-on-rebuild + A1 drop sources-guard + A4 sink-failure clears selected id (defense-in-depth).
- FIX-B: cross-publisher mid-overwrite guard + 2-publisher regression test (R2 — never drop a voice).
- FIX-C: R3 media-playout + playout-state diagnostics (R3 — make next call definitive).

## Panelist verdicts (artifact pointers)
opus: opus-verdict-r2.md · codex55: codex55-verdict-r2.md · gpt54: gpt54-verdict-r2.md · spark: spark-verdict-r2.md · sonnet: sonnet-verdict-r2.md · haiku: haiku-verdict-r2.md

## Goal closure check
Goal: identify TRUE root cause of inaudible remote audio + converge on fix.
Closed: YES on root-cause class + fix plan (unanimous AGREE). Residual: A3-vs-A4 exact-trigger split is intentionally bridged by the fix bundle (both fixed) + R3 (next call proves which). Verification rounds (R3+) red-team the fix plan toward JROM's 3-consecutive-clean bound.
