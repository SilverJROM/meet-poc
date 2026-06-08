# og-requirements — Host cannot hear remote audio on real cross-platform / international call (2026-06-08)

## Context (JROM, verbatim)
> "i have performed a call with a friend in the US and the app is still broken as i still cant hear him but he can hear and see me."
> "the phone is android and the peer2 is a minisforum with windows installed with a external mic"
> "both audio is missing on my end i cant hear peer2 ... on both his devices"

JROM (PH, host) ↔ friend "peer2" on TWO US devices: a Minisforum mini-PC (Windows + external USB mic) and an Android phone. Single live environment = the app hosted on JROM's own machine. This is a recurrence after FIX1–FIX5 (2026-06-04/05) did NOT close it.

## Evidence (today's call — session 11ee886f, 2026-06-08 08:24–08:27 Manila)
Captured in `diagnostics-evidence-2026-06-08.md` (this dir). Summary:
- JROM **outbound works**: friend's both devices received JROM audio (Win 284 KB / phone 153 KB) + video (Win 11.4 MB / phone 4.7 MB), 0 loss → "he can hear & see me".
- Friend cameras OFF (video bytesSent = 0 both) → JROM "can't see him" is EXPECTED, not a bug.
- JROM **inbound audio packets ARRIVE for BOTH publishers** (peer2/Win climbed 0→194 KB then switched to phone 0→86 KB, **0 packets lost**) — yet JROM **heard neither**.
- JROM was only ever subscribed to **ONE remote audio publisher at a time** (peer2 → gap → phone), never both simultaneously.
- Inbound `audioLevel` / `totalAudioEnergy` are **null** in the capture → cannot yet separate "decoded-but-not-routed-to-speaker" from "received-but-not-decoded".

## Requirements (the contract — acceptance target)

**R1 — Host hears every remote participant's audio.** On a real multi-device, cross-platform, international call, the host (JROM) must hear audible audio from every remote publisher who is sending audio. Acceptance: on a live US↔PH call, JROM confirms he hears peer2 speaking from whichever of peer2's devices is the active talker. Evidence-of-closure includes inbound RTP flowing AND the remote audio reaching an audible output sink (proven by the new diagnostics in R3 + JROM's real-call confirmation).

**R2 — Host receives audio from ALL concurrent remote publishers, not one at a time.** When two remote audio publishers are present, the host subscribes to and mixes BOTH concurrently. The "one inbound audio track at a time" behaviour observed today must not occur — adding a second remote audio publisher must not displace the first. Acceptance: getStats on the host shows ≥2 concurrent inbound audio tracks with bytesReceived climbing for each, and the mixer holds ≥2 sources.

**R3 — Inbound-audio playout observability.** Diagnostics must capture, per inbound audio track, enough to PROVE whether received audio was rendered audibly: inbound `audioLevel` + `totalAudioEnergy` + `concealedSamples`, AND host playout state (AudioContext state, output element attached/paused, mixer source count, per-publisher mixed/not-mixed). Acceptance: a future call's diagnostics row alone is sufficient to localize an inaudible-audio failure to subscribe / decode / mixer / sink without guesswork.

## Out of scope
- Remote video receive (friend cameras were off — nothing to receive; not a defect this run).
- Recording, transcripts, lobby/self-test, device-selection acquisition (covered by prior runs unless the panel proves one is the live root cause).
- Outbound (host→remote) path — proven working today.

## Definition of done
Every row of `req-matrix.md` = VERIFIED, AND JROM confirms on a real US↔PH call that he hears peer2. No requirement closed on green specs alone (fake-media masks real playout — see 2026-06-04 lesson).
