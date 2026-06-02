# Decision: DynamicsCompressorNode-as-brick-wall-limiter for same-room feedback suppression

## Context
Two co-located devices acoustically couple: device A's speaker plays B's audio, A's
mic re-captures it, and the loop re-amplifies on every round trip. Per-device
`echoCancellation` (requested capture-side via `{ideal:true}`) cannot cancel a
SECOND physical device's speaker bleed — it only models its OWN render path. The
output mixer (`source → gain → destination`) previously had no peak control, so a
runaway loop was unbounded: each pass adds gain and the howl escalates without limit.

JROM locked the response to SUPPRESSION ONLY: no detection UI, no auto-mute, no
warning banner. The remaining lever is the signal path itself.

## Decision
Insert a Web Audio `DynamicsCompressorNode` configured as a **brick-wall limiter**
between the volume/mute `GainNode` and the `MediaStreamAudioDestinationNode`:
`source(s) → gain → limiter → destination`. The gain node stays the sole volume/mute
control (upstream); the limiter is purely downstream peak control.

A `DynamicsCompressorNode` is the only native Web Audio node that performs dynamic
gain reduction. With a high ratio + near-zero attack it behaves as a limiter (no
external lib, no AudioWorklet, no added latency-significant nodes).

## Parameter justification — `FEEDBACK_LIMITER_PARAMS = { threshold: -3, knee: 0, ratio: 20, attack: 0.003, release: 0.25 }`

- **threshold: -3 dB** — engage only on signals near full scale. Normal conversational
  speech through the mixer sits well below -3 dBFS, so steady speech passes
  untouched (RF2-S6: no pumping/squash on normal speech). A feedback runaway is
  precisely the signal that climbs toward/above 0 dBFS, so -3 dB catches exactly the
  runaway peak and nothing quieter. Criterion `<= 0` (never amplifies a clean signal).

- **knee: 0 dB** — hard knee. A limiter wants an abrupt onset at threshold, not the
  gentle soft-knee curve of a musical compressor. A soft knee would start gain-reducing
  loud-but-legitimate speech below threshold (audible pumping). 0 keeps speech below
  -3 dB perfectly linear and clamps hard the instant a peak crosses.

- **ratio: 20:1** — limiter-shaped (criterion `>= 20`). Above threshold, 20 dB of input
  rise yields ~1 dB of output rise, i.e. the output is effectively pinned near the
  threshold ceiling. This is what bounds the feedback: even as the acoustic loop tries
  to add gain each pass, the mixer output cannot escalate past the ceiling, so the howl
  is capped instead of running away. (Web Audio max ratio is 20, so this is the
  hardest available limit.)

- **attack: 0.003 s (3 ms)** — fast enough to catch a feedback peak before it audibly
  escalates within a single loop round-trip, but not so instantaneous as to distort the
  waveform of legitimate transient speech (a sub-ms attack can introduce harmonic
  distortion). 3 ms is the standard brick-wall-limiter attack.

- **release: 0.25 s (250 ms)** — how fast gain recovers after a peak. Long enough to
  avoid "breathing"/pumping (a too-short release re-opens between syllables and
  modulates the noise floor audibly); short enough that the limiter doesn't stay
  clamped and dull the program after a transient passes. 250 ms is a transparent
  speech-program release.

## Critical guard: NO makeup gain (mute-all silence, RF4-S9)
`DynamicsCompressorNode` has no makeup-gain parameter, and we deliberately add no
post-limiter gain node. A compressor/limiter with no makeup gain maps 0-amplitude
input to 0-amplitude output (it only ever *reduces* gain above threshold). Therefore
`setMutedAll(true)` (which sets `gain.gain.value = 0`, unchanged by B2) still yields
true silence through the chain: 0 in ⇒ 0 out. `DEFAULT_VOLUME` stays 1 and
`MAX_VOLUME` stays 1.3 — no path amplifies above the user's chosen volume.

## Teardown
`reset()` disconnects and nulls the limiter alongside gain/destination, so re-entering
a room rebuilds a fresh limiter via `ensureGraph()`. Optional chaining on
`this.limiter?.disconnect()` makes reset safe when the graph was never built.

## What this is NOT
The limiter is signal-path only. It drives no template, no signal, no auto-mute. It
suppresses (bounds) feedback; it does not detect or react to it. Capture-side
EC/NS/AGC remain best-effort `{ideal}` (a device may decline them — surfaced by the
`unappliedAudioProcessing` debug log, never enforced). See changes.md for the honest
reduce-not-eliminate limitation.
