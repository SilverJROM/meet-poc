# CONSENSUS — clean both-ways + 3/4-way full-mesh (6-panel, 2026-06-20)

5/6 verdicts (opus, haiku, sonnetb, spark, grokc) — UNANIMOUS. agent-inbound-0 = ORCHESTRATION/TIMING, NOT an SFU/app bug (SFU fan-out is fine). All gaps are measurement-attribution + test-orchestration ordering.

## Root cause of agent-inbound-0
Host had just restarted / wasn't stably publishing to the SFU when the agent measured; and measurement started before subscribe/ontrack readiness. Pure timing.

## THE FIX (measurement-rig upgrade — our side + Peer2 side)
1. READINESS BARRIER (the single biggest both-ways win):
   - Gate#1: host OUTBOUND-rtp bytes RISING (host actually publishing to SFU) BEFORE triggering the agent run.
   - Gate#2: each receiver's INBOUND-rtp bytes rising + ontrack/subscribed ready BEFORE measurement starts — NOT after admit. (frontend/src/app/services/sfu-client.service.ts:187 — wait for subscribed/ontrack readiness.)
2. SINGLE WALL-CLOCK WINDOW via a relay START marker (START_MEASURE_AT). All parties measure the SAME call session in the same window; NO host restart between directions/pairs. (pattern ~ b1-remote-join.spec.ts:225-231.)
3. PER-PUBLISHER PER-TRACK measurement + FFT SPECTRAL ATTRIBUTION:
   - Measure each REMOTE MediaStreamTrack separately (getStats inbound-rtp per ssrc/track) — NOT host/global/mixed/media-playout stats (insufficient; rejected as proof).
   - FFT/AnalyserNode spectral peak per track, attribute to the publisher by tone Hz (±20-60Hz). Required for 3+ party to prove WHICH publisher is heard.
4. NON-HARMONIC 4-TONE SET: repo has 440/880 (harmonic octave — bad for attribution). Add 660 + 1100 fixtures; choose a non-harmonic set for clean spectral separation. (e2e/fixtures/audio-rig.ts:9, e2e/fixtures/audio/.)

## PASS CRITERIA (matrix)
Full ordered-pair matrix, 3 criteria PER CELL: (a) energy ≥3s, (b) spectral peak attributed to that publisher's tone, (c) per-publisher inbound bytes-delta >0.
- 2-way: 2 pairs (host↔agent), clean SIMULTANEOUS, both in one run.
- 3-way: all 6 directed pairs (host/agent/local).
- 4-way: all 12 directed pairs (+local2).

## N-way scales on existing SFU — NO SFU/app changes. Just the rig + per-publisher attribution + readiness gates.

## Implement (routing)
- sonnet: upgrade e2e/fixtures/audio-rig.ts measurement → per-publisher per-track + FFT attribution + readiness gates (gate#1/#2) + START_MEASURE_AT sync + 660/1100 non-harmonic tones. (complex, careful.)
- Peer2-codex (gpt-5.5, user-side): upgrade its agent measurement to per-track + spectral + honor START marker + report per-publisher (delegate — its side, real C930e mic).
- grok (test-driver): drive the matrix runs (clean 2-way → 3-way [+1 local 660] → 4-way [+1 local 1100]) using the upgraded rig.
- Also fix app bug (sonnet, separate): __meetDebug.micWorking false despite working — make authoritative or stop relying on it.

## Order: rig upgrade → clean 2-way (one simultaneous run, 2/2 pairs) → 3-way (6/6) → 4-way (12/12) → THEN screenshare(R11) → video(R7) → durability → recording+transcript. Hold video/durability until 2-way green + 3-way 6/6.
