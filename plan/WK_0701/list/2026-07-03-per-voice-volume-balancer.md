# Per-voice volume balancer/normalizer (auto-level quiet vs loud voices)

- **Type:** feature
- **Status:** LOGGED, NOT STARTED (R5) — `projcore-run-2026-07-03` PAUSED 2026-07-04 (token
  budget, JROM) before any deliberation/implementation began. See run's `context-handoff.md`.
- **Raised:** 2026-07-03 · **Handler:** projcore

## JROM verbatim
> "some of the voices on the app is has very low volume and hard to hear it was very silent
> even on max volume, can we add a sort of balancer on the app where if the voice is kind of low
> volume we amplify it and try to make all voices have the same volume, not to the point that its
> over amplified but enough to be 85-90% of the loudest or highest volume of the call so that we
> can hear each others as some of the users have louder voice while other is low volume, this is
> kind of like a equalizer of sorts on the voice."

## Feasibility confirmation (given in-conversation before logging)
Confirmed technically feasible — each remote participant already has its own separate
`<audio>` element (`remote-audio.service.ts`, `mixerEnabled()` returns false), so a per-peer
`GainNode` + `DynamicsCompressorNode` reusing the already-polled per-track audio-level data
(`sfu-client.service.ts` `collectDiagnostics()`) is the approach. Open design decision (feeds
R5 deliberation): reuse the existing but currently-silenced (`gain=0`) per-peer WebAudio graph
in `active-speaker.service.ts` (built for active-speaker detection only) vs. build a parallel
graph for actual playout.

## qa_verification
pending — R5 acceptance criteria in `projcore-run-2026-07-03/og-requirements.md`.
