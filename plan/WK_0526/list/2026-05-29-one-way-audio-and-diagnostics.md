# One-way audio (US user) + all-sides diagnostics with on/off switch

- **Date raised:** 2026-05-29
- **Type:** bug investigation (one-way audio) + feature (diagnostics improvement)
- **Status:** DIAGNOSED — awaiting scope confirmation for the build
- **Agent:** projcore
- **qa_verification:** pending

## JROM verbatim
> "i had a call yesterday from a US user and he was able to hear me but i was not able to hear him, he is using a device with a external mic device, so we opted to do the call using google meet and his setup worked. can you check the diagnostics on here to see whatt is the problem to solve here?"
>
> "also this is the time to improve our diagnostics on all side (users/host) so that we can properly diagnose these issues should it arise, just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

## Diagnosis (from 1,561 persisted diagnostic records, 2026-05-28)
One-way audio = **remote peer's published audio carried almost no RTP** (sender-side capture failure), NOT a network/downlink/SFU-subscribe failure.

Evidence (JROM's inbound stats, per-publisher): quiet peers showed
`packetsReceived` 45–441 over the whole call, `bytesReceived` 2.8–23 KB,
`packetsLost ≈ 0%`, but `concealedSamples` 600k–915k (**60–95% concealment**),
while the SAME peer's **video flowed normally** (hundreds–thousands of frames, MBs).
- `packetsLost ≈ 0` ⇒ SFU→JROM downlink + subscription healthy.
- video OK ⇒ peer connection / ICE fine.
- audio RTP essentially absent ⇒ remote mic not actually captured (silent/wrong device).
- For the US user (external mic, worked on Google Meet): most likely our app captured the
  **system-default input (dead/built-in/muted)** instead of the external mic.
- Pattern recurs across **several** 2026-05-28 calls ⇒ systemic, not a one-off.

## Diagnostics blind spot found
Guests DO upload diagnostics (Caily/Jtest/Yes/etc.), BUT
**`outboundAudioLevel` / `outboundAudioEnergy` / `micSilent` are null in 100% of samples (1561/1561)** —
the local mic-energy metric is never populated, so we have NO source-side proof of a silent mic.
This is the #1 thing to fix to "properly diagnose these issues should it arise."

## Planned work (pending scope confirmation)
1. Populate local mic-energy metric (outboundAudioLevel/energy/micSilent) on ALL clients (host + guests).
2. Per-participant attribution for diagnostic rows (currently all stored under host_email).
3. Global on/off switch for diagnostics (settings UI + backend gate; default ON).
4. (Optional, same run) capture-side fix: silent-mic / wrong-device detection + warn + auto-recover.

## Update 2026-05-29 — greenlight + root-cause refinement
JROM: mic was tested working + worked on Meet ⇒ it's our code. Greenlight ("go ham").
- Run launched: `plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29/` (overmind wf #6).
- Implementer: /lead (Opus) in tmux `lkvc-opus`; projcore validates (verifier≠fixer).
- Status: IN PROGRESS — B1 (mic-energy metric) in plan-handshake.
- B2 retargeted to root-cause the capture (device selection + getUserMedia constraints), watchdog as safety net (north-star NS9).

## Update 2026-05-29 (#2) — device self-test false pass injected (R8)
JROM: the pre-call mic self-test passed but the call sent silence — "unacceptable." Injected as R8 / batch B5 (runs after the capture fix B2): self-test must measure the real transmit path + flag a non-working mic. Greenlight mode (no re-interview).

## Update 2026-05-30 (#3) — multi-device mic fallback (R10 / B2c)
JROM: fall back to other available mics when one fails; prompt only when none work. Amends B2a's same-device-only lock (AC5). Injected as R10 / B2c right after the in-flight B2b. Recovery stays non-destructive + bounded (one sweep/episode).
