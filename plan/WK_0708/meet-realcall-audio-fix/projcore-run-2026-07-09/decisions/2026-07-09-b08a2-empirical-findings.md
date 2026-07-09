---
source: impl (B08A-2, sonnet L3)
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: standard (carry-forward for north-star / B13W design)
search_hooks: [DTX, packetsSent, totalAudioEnergy, classifySenderLiveness, capture-dead, sender-dead, replaceTrack, setParameters, active:false, no comfort noise]
---

# B08A-2 empirical finding — no DTX on this stack: "capture-dead" is energy-frozen + packets-still-climbing, not "both frozen"

While forming the PROPOSED plan for B08A-2 (AC15b discriminator), I ran a throwaway probe (real
Chromium, loopback `RTCPeerConnection` pair on `127.0.0.1`, no room/SFU/login — deleted after, `e2e/`
left clean, 0/25 call burn) to measure what `totalAudioEnergy` (`media-source`/audio) and `packetsSent`
(`outbound-rtp`/audio) actually do under six candidate injections, before locking the classifier's
four-way logic. This is a **measurement**, not a re-derivation of D29's prose — and it overturns one
assumption D29's summary table made.

## What was measured

| injection                                     | `totalAudioEnergy` | `packetsSent`/`bytesSent` |
|------------------------------------------------|---------------------|------------------------------|
| baseline (real fake-device audio)               | climbs              | climbs                       |
| B07 Mode B (literal digital silence)            | **frozen**          | **keeps climbing**           |
| B07 Mode A (frozen-nonzero DC offset)           | keeps climbing      | keeps climbing                |
| `sender.setParameters({...e, active:false})`    | keeps climbing      | **frozen**                   |
| `track.enabled = false`                         | frozen              | keeps climbing (!)           |
| `sender.replaceTrack(null)`                     | null (stat gone)    | frozen                       |

Chrome runs no DTX / comfort-noise suppression on this outbound mic path: RTP keeps flowing at a
steady packetization cadence encoding silence even when the captured signal is literal digital zero,
and even when the track is disabled. `packetsSent` only actually freezes when the RTP *sender* itself
is deactivated (`setParameters(active:false)`) or the track is pulled from it entirely
(`replaceTrack(null)`).

## Consequence — corrects D29's summary table, not its mechanism

D29's table described "capture dead (stats frozen wholesale)" as both counters flat together. That
does not hold at the raw-stats level on this stack for a literal-silence fault — only
`totalAudioEnergy` freezes; `packetsSent` does not. The **mechanism** D29 (D4) diagnosed is still
correct and is in fact corroborated by this measurement: a dead/silent mic reads `totalAudioEnergy`
flat while `packetsSent` keeps advancing, which is exactly the input `classifyMicCapture` already sees
(it only reads the capture-side energy) — so `classifyMicCapture` correctly calls it `'silent'` and R1
correctly fires for that case. The "sender-dead, capture-alive" case is the true mirror image
(`totalAudioEnergy` climbs, `packetsSent` frozen) and is exactly what R1 is blind to, per D29's own
D4 analysis — unchanged.

`classifySenderLiveness` (B08A-2, `mic-energy.ts`) is built off this measurement directly:
`captureAdvancing` (energy delta) × `senderAdvancing` (packet delta) → `both-advancing` /
`sender-dead` (capture✓/sender✗) / `capture-dead` (capture✗/sender✓) / `indeterminate` (both✗, or
insufficient samples — genuinely ambiguous: total link death, closed PC, or too-thin a window).

This also explains, with a measurement rather than an assertion, why the B08A-2 brief bans
`replaceTrack(null)`/`track.enabled=false` as the **sender-dead** injection mechanism: both read close
to (or exactly like, for `replaceTrack(null)`) the capture-dead signature — using either to *forge*
sender-dead would have produced a confounded, wrong proof. `setParameters({encodings:[{...e,
active:false}]})` is the only one of the six measured mechanisms that cleanly isolates sender-dead.

## Carry-forward for B13W (watchdog, later batch)

B13W's contract (D29) — "fires when `totalAudioEnergy`/`totalSamplesDuration` advance while
`packetsSent`/`bytesSent` do not" — is unaffected; this finding sharpens what "capture dead" looks like
on the *other* side of that same discriminator, which B13W does not itself need to detect (its job is
sender-dead only). Flagging here so a future capture-dead-specific watchdog (if one is ever proposed)
does not assume "both frozen" is the real-world signature — it is not, on this stack.

## Scope note

This finding does not change AC15's status: AC15 is still **NOT VERIFIED** by B08A-2 (discrimination
clause only, offline/zero-call). The live clause remains B08A-3, gated on a far-end transcript per D29
and the plan.md standing note on AC15's two clauses.
