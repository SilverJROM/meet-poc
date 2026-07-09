---
source: north (addendum, requested by co-planner D4)
date: 2026-07-09
effort: meet-realcall-audio-fix
run: projcore-run-2026-07-09
priority: critical
search_hooks: [classifyMicCapture, early return working, R1 blind, sender death, watchdog, B13W, evidence spine, diagnostics gap, totalAudioEnergy]
---

# D29 — Addendum to D28.3: R1 is BLIND to sender-death, not merely mis-remedied

The co-planner (D4) sharpened D28.3 and is **correct**. /north verified in code.

## The mechanism (verified, `mic-energy.ts:174-176`)

```js
const delta = energies[last] - energies[0];       // totalAudioEnergy = CAPTURE-side counter
if (delta >= epsilon) return 'working';           // ← EARLY RETURN, before the variance check
// ... frozen-level variance check (856104f) is only reached when energy is FLAT
```

`totalAudioEnergy` measures **capture**, not transmission. Therefore:

| case | `totalAudioEnergy` | `classifyMicCapture` | R1 self-heal | verdict |
|---|---|---|---|---|
| **capture dead** (stats frozen wholesale) | flat | `'silent'` (856104f variance check) | **fires** → re-acquires mic | remedy may still be wrong if the true fault was the sender and its stats froze with it (D28.3 stands here) |
| **sender dead, capture alive** | **advancing** | **`'working'`** (early return) | **NEVER FIRES** | **856104f is BLIND. A remedy hung off R1 would be dead code.** |

**Correction to D28.3:** /north wrote that `856104f` "may be treating the wrong subsystem." For the
**sender-dead** case that understates it — the detector never triggers, so no remedy runs at all. The
"wrong remedy" reading applies only to the capture-dead-with-frozen-stats case.

**Consequence for design:** the sender branch **cannot** hang off R1's trigger. It needs an
**independent watchdog** keyed on RTP counters. The co-planner's **B13W (watchdog) sequenced BEFORE B13
(remedy)** is the right shape. Approved.

## Watchdog contract (B13W)

Fires when, over a window: `totalAudioEnergy` / `totalSamplesDuration` **advance** (capture alive) while
`packetsSent` / `bytesSent` **do not** (sender dead). Independent of `classifyMicCapture`. Remedy (B13):
`replaceTrack` / renegotiate / ICE restart — **never** mic re-acquisition, which cannot fix a stalled sender.

## NEW REQUIREMENT — the diagnostics gap (why 07-08 is still ambiguous)

We **cannot say which failure mode hit Acctg**, because the 07-08 diagnostics recorded `outboundAudioLevel`
and `micSilent` but **not** `totalAudioEnergy`, `packetsSent`, or `bytesSent`. A frozen `audioLevel` alone
cannot distinguish the two rows above.

**Binding:** the app's diagnostics payload MUST emit `totalAudioEnergy`, `totalSamplesDuration`,
`packetsSent`, `bytesSent` per outbound audio track. Without this, the **next** real call is as
undiagnosable as the last one. This closes the loop on T1 for real calls, not just the harness.
Folded into **AC15**.

## D2 — Evidence spine was missing. /north's plan had a hole.

Co-planner finding: `RecordingArbiter` (B02) only **analyzes a WAV already on disk**. There was
**no dual-browser call driver, no receive-side recorder, no transcriber**. Every live AC
(AC1, AC2, AC4, AC5, AC6, AC7, AC8, AC9, AC15-live, AC16) was therefore blocked with **no batch building
the thing they all depend on.**

**This is /north's error**: the requirements demanded "the recording is the arbiter" without commissioning
the machinery that produces a recording. **B08S-1 / B08S-2 (evidence spine) APPROVED** and must land
before any live AC is attempted. Good catch — exactly the deliberation earning its cost.

## Standing

Everything else in D28 holds: TURN hypothesis refuted (one bundled `RTCPeerConnection`); absolute
target-loudness gain reference, never local-publisher; webrtcperf admitted only for multi-party/relay/load
and **never as arbiter**; recording remains the arbiter; INVALID ≠ PASS; a self-declared scaffold is an
automatic FAIL.
