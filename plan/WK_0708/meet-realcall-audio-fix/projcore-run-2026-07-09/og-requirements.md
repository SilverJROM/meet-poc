# OG Requirements — Automated voice fix→test loop (run 2026-07-09)

**Effort:** `meet-realcall-audio-fix` · **Run:** `projcore-run-2026-07-09`
**Author:** `/north` · **Consumer:** grok-4.5 projcore (SUB-MODE) → co-planners → implementers
**Branch under test:** `batch-01-diagnosis-2026-07-08` (consolidated main + fix `856104f`), deployed on
DEV `https://voice.silverjrom.app`. **Do NOT merge to `main` in this run.**

---

## 1. The verbatim problem (JROM's words — never paraphrase these away)

Origin of the effort (2026-07-08, after a failed live client call):

> "i cant hear the user and he may be able to hear me, but after multiple tries we opted to change to
> google meet, the app is not at a good working condition right now."

> "just fix it both can hear each other and anyone can share screen and view each other on the app."

> "the previous issue was that one of the joiner's volume is very low that we cant hear her so i asked
> for a fix and this is the result"

This run (2026-07-09), scoping the automated loop:

> "i want to do a live test, with us on this machine having a light model (via llama cpp) powering the
> brain conversation as well vs dev machine (its own harness) and conversing for 3mins+ until this is
> error less"

> "the error definition is the error on the last call one party cant here the other on the call,
> connections dropping, etc basically useability if it recovers within a real call that is in real-time
> not noticiable its workable but dropped calls, can t hear is the error im describing"

> "i beleive i requested an audio amplifier on the app, so basically weak signals needs to be amplified
> by atleast 85-90% of the normal signals on the call, so an acceptable probably is 70-75% that is a pass"

> "we dont want to adjust it full volume at the gate terrorizing the participants on teh call with the
> loud volume, this needs to be eased on the amplifcation, only adjusting increasingly until the target
> is reached" … "i can do 6-8secs easing max 10 is fine" … "not in an instant blast"

> "i need you to fully test this by forcing the audio on one participant to be weak"

> "this is a fully automated fix -> test loop i will test after its completed so dont hold out on
> completion for me once done mark it done"

> "we need to conserve resources when we can"

## 2. Evidence base (real, not synthetic)

Real call, session `652c1475`, 2026-07-08 09:44–09:56 Manila, room `a78ae0bd02b6`, 185 events.
- JROM (desktop): mic healthy, `audioLevel` varying 0.005–0.497.
- Acctg (**Android 10 / Chrome Mobile 150**): rejoined **4×**, never gathered a relay candidate.
  - **Mode A** (client `8dd16229`, ~3 min): `outboundAudioLevel` **frozen at exactly
    `0.228949858088931`**, `micSilent=0` → the magnitude-only detector was fooled; the R1 self-heal
    (gated on `micSilent=true`) never fired.
  - **Mode B** (`3baf851b`, `7b975db0`): `micSilent=1`, level 0, 5 error events, never recovered.
- Acctg's `connectionState: "subscribed"` to JROM's track → she could hear him. One-way confirmed.

**This session (`652c1475`) is the only real evidence of the actual bug. It must never be deleted.**

## 3. Definitions (make the ACs falsifiable)

- **ERROR (JROM's bar — usability, not telemetry):** a party **cannot hear** the other, or the **call
  drops**. A dropout that self-heals fast enough to be **unnoticeable in real time is NOT an error.**
- **DROPOUT THRESHOLD (`T_gap`):** the gap duration above which "can't hear" counts as an error.
  **JROM delegated this to /north** (he is unavailable; the loop must not block). It is **derived from
  the measured gap distribution of the first two calls** and written to `decisions/` with its
  justification before any AC gates on it. JROM may overrule after the fact.
- **ACHIEVED RATIO (`A`):** the quiet peer's loudness as a fraction of the loudest peer's, **measured
  from the receive-side recording** (RMS / EBU R128 LUFS over voiced segments) — **not** from stats.
- **`r`:** the quiet peer's *published* level as a fraction of the loudest peer's, at the SFU.
- **INVALID (a third verdict, distinct from PASS/FAIL):** the stimulus did not reach the system under
  test (e.g. AGC swallowed the attenuation). An INVALID result **must never be reported as PASS.**

## 4. Acceptance criteria

Every AC is proven from the **receive-side audio recording** and/or the **transcript**. WebRTC stats may
corroborate but may **never** be the sole evidence — they are the layer that lied on 07-08.

### Amplification (the quiet-joiner remedy)

- **AC1 — Forced weak-signal sweep.** With a harness-side `getUserMedia` shim placing a `GainNode`
  **downstream of Chrome's audio processing**, force one participant's published audio to
  `r = 0.50, 0.30, 0.20, 0.10, 0.05`. For each point:
  - **Verify the stimulus first**: the peer's published/received `audioLevel` must reflect the intended
    `r` (±20%). If not → **INVALID**, not PASS. (AGC is `autoGainControl: {ideal:true}` in
    `mic-energy.ts:52` and may re-normalize.)
  - Then assert **`A ≥ 0.70`** (target 0.88, `AUTO_LEVEL_TARGET_RATIO`).
  - **Open question the sweep must answer:** `AUTO_LEVEL_MAX_GAIN = 2.5` implies
    `A = min(2.5·r, 0.88)`, so `A ≥ 0.75` requires `r ≥ 0.30`. If the sweep confirms this, the cap is a
    **defect** and raising it / adding compressor makeup gain / normalizing at source is **in scope as a
    fix.** If the sweep refutes it, say so plainly — the prediction was a desk calculation.
  - **THE 2-PARTY NO-OP (verified numerically, /north + co-planner + codex55):** `loudest` is computed over
    **remote** publishers only. With exactly one remote publisher, `loudest == that peer`, so
    `raw = max(1, 0.88) = 1.0` — **unity gain, no amplification, at any level** (`audioLevel = 0.02` →
    gain `1.0`). **The amplifier is a complete no-op on every 2-party call**, which is the ReceiptBOT
    topology. Expect `A ≈ r` at every sweep point **pre-fix**. Observing boost in 2-party **REFUTES** this
    and must be reported loudly.
  - **THE FIX (D28, codex55):** adopt an **absolute target-loudness reference**, plus smoothing, a noise
    gate / floor, and a max-gain cap. **Do NOT use the local publisher's level as the reference** — local
    mic/AGC/noise differences would make the remote gain chase the wrong source, amplifying a quiet
    remote's noise floor or punishing a good remote merely because the local speaker is loud. Guard
    `>=3-party` per AC17.
  - **Reference for `A` (binding):** `A` is measured **same-speaker, same path** — the attenuated speaker's
    voiced-segment loudness at the far end, divided by **that same speaker's** loudness at normal level at
    the same far end. **Never** against "the loudest remote," which is the degenerate quantity under test.
    Record the normal-level reference pass **before** the sweep.

- **AC2 — Faithful weak mode.** Attenuate at the **source** (dev_machine PipeWire virtual mic), *before*
  capture, with AGC left ON — the real soft-talker scenario. Assert `A ≥ 0.70`. If AGC compensates,
  record by how much: that is a finding about real quiet joiners, not a failure.

- **AC3 — Ease-in, not an instant blast.** The applied gain must:
  - reach **90% of target in 6–8s** (10s absolute max, JROM),
  - be **monotonic** with **no single step > ~1–2 dB** (today `applyVolumeState` writes
    `gain.gain.value` directly → a **+3.7 dB jump** on the first 1.5s tick; the ramp must move to an
    AudioParam ramp, e.g. `setTargetAtTime(target, now, tau≈2.5s)`),
  - fall **fast** when a quiet peer suddenly gets loud (asymmetric attack/release; today both directions
    share `AUTO_LEVEL_SMOOTHING = 0.35`),
  - never exceed the limiter ceiling (`DynamicsCompressorNode`, threshold −18 dB, ratio 4:1, stays as a
    backstop).
  - **Do not slow the ramp.** Measured today: ~9.0s to 90%, ~10.4s to 95% — already near JROM's ceiling.
    The defect is discontinuity, not duration. Do not "fix" it by making it slower.

### Failure injection (reproduce what we can; be honest about what we can't)

- **AC4 — Mode A (frozen non-zero level). AMENDED by D28.** Inject a constant-amplitude tone so the
  published `audioLevel` is pinned non-zero with zero variance and no speech. Assert: (a)
  `classifyMicCapture` classifies it **silent** (the `856104f` variance check); (b) the harness
  **diagnoses which subsystem died** via the AC15 invariant; and (c) the recovery **remedy matches the
  diagnosis**, proven by the far end **transcribing** words after recovery.
  - **capture dead** (`totalAudioEnergy` NOT advancing) → re-acquire mic (current R1 behaviour).
  - **sender dead** (`totalAudioEnergy` advancing, `packetsSent`/`bytesSent` stalled) → `replaceTrack` /
    renegotiate / ICE restart. **R1's mic re-acquisition fixes nothing here.**
  - "Detected" is **no longer sufficient** to close AC4. `856104f` may be treating the wrong subsystem.

- **AC15 — Sender-liveness invariant (the T1 discriminator, D28).** During speech that the far end
  verifiably transcribes, assert that **both** advance: `totalAudioEnergy` + `totalSamplesDuration`
  (capture side) **and** `packetsSent` + `bytesSent` (sender side). Then inject each failure
  independently — (i) capture-dead, (ii) sender-dead-with-capture-alive — and prove the harness **tells
  them apart**. A frozen `outboundAudioLevel` is consistent with *both*; only this invariant separates
  them. No prior run examined these stats.

- **AC16 — Relay / ICE evidence.** The client **gathers a `relay` candidate** (the real 07-08 call never
  did, across 4 rejoins), and a forced `iceTransportPolicy: 'relay'` call carries audio end-to-end
  (the app already exposes `forceRelayDiagnosticRequested()`). **Note (D28):** absence of a relay
  candidate is a *fragility* signal, **not** the cause of 07-08 — one bundled `RTCPeerConnection` carries
  both directions, so ICE was demonstrably alive (she could hear JROM).

- **AC17 — `>=3-party` guard.** The AC1/AC2 gain fix must not regress multi-party, where
  `A = min(2.5·r, 0.88)` governs. `@vpalmisano/webrtcperf` is **permitted here** (multi-party scaling,
  relay-only load, packet-loss/jitter) but is **BANNED as an arbiter** and from any capture-path
  assertion — its fake media bypasses the capture path under test.

- **AC18 (LOW PRIORITY) — TURN-mint resilience.** Stub `/api/ice-config` to time out or return STUN-only;
  assert the app degrades **loudly**, not silently. **Not a cause of 07-08.** Must not displace
  capture-path work.
- **AC5 — Mode B (dead mic, zero level).** Silent track, `micSilent=1`. Assert detection **and** recovery.
- **AC6 — Network degradation.** Using `tc netem` on dev_machine: packet loss, jitter, latency, and a
  hard interface drop. Assert the call either survives or recovers within `T_gap` (imperceptible), and
  that a genuine drop is reported as a drop.
- **AC7 — Track-ended / publish failure / rejoin storm.** Assert graceful recovery, no permanent one-way.

### Sustained call (the loop's exit)

- **AC8 — Clean 3–5 minute conversing call.** `.140` ↔ `.123`, both with local llama brain + whisper +
  piper. Zero ERRORs per §3. Both directions transcribed successfully throughout.
- **AC9 — Clean 10-minute final gate.** Same, sustained 10 minutes.
- **AC10 — No regression.** Screen share works both ways; video works both ways; the quiet-voice remedy
  (AC1/AC2) still holds. (Carries AC5/AC6/AC7 of the 07-08 og-requirements.)

### Confirmation leg (only after local is finalized)

- **AC11 — SG confirmation.** `silverjrom.com` (1 vCPU / 954 MB) joins **Chromium-only**, plays a
  pre-supplied WAV (transcoded from JROM's clip; Chrome's fake-audio input accepts **WAV only**), and
  does **not** listen or transcribe. `.140`/`.123` transcribe what arrives from SG; SG reports only
  connection signals (ICE state, packet loss, outbound level). **SG is never iterated on** — any error
  is fixed locally first, then SG is re-added.

### Hygiene and ops

- **AC12 — Diagnostics hygiene.** Each test logs its findings, then **deletes only the diagnostics that
  test generated**, matched by IDs captured at creation. **Never delete session `652c1475`. Never delete
  room `TEST_ROOM01` (`testroom01001`).** No wildcard sweeps.
- **AC13 — Room/session cleanup.** Rooms and sessions the harness created are deleted before DONE.
- **AC14 — `dev_machine` is shut down** when the run ends, and whenever it is not in use (JROM standing
  ops rule). Graceful, WoL-safe: `ssh silverjrom@192.168.254.123 'sudo nohup poweroff …'`.

## 5. Budget and exit (bounded — no infinite loop)

- **25 calls** of 3–5 minutes. Each attempt **burns one**, including harness-caused aborts.
- **10-minute final gates do NOT burn**, but are capped at **5** so they cannot be used as an escape hatch.
- **Exit:** (AC8 ∧ AC9) **or** budget exhausted → **STOP**, write the report, notify, shut down
  dev_machine. **No gate waits on JROM.**
- Completion wording is **"ready for JROM's real-call test"**, never a bare "fixed."

## 6. Hard constraints

1. **Recording is the arbiter.** Stats corroborate; they never decide.
2. **The harness must not manufacture failures.** Bots speak on a fixed clock from pre-generated audio;
   the LLM is **async** and never gates speech. A slow brain reads as a dead mic.
3. **INVALID ≠ PASS.** Unverified stimulus fails the test.
4. **Verifier ≠ fixer** at every tier (topology.yaml).
5. **No merge to `main`** — gated on JROM's real cross-device call (project north-star §6).
6. **Fix locally; SG is confirmation-only.**
7. **Conserve resources.** codex55 has ~4% weekly headroom — ration it (gates only, sonnet fallback).
   Prefer cheap tiers; no elite red-team unless a fix has failed twice.
8. **FE must be rebuilt** (`ng build`) for any FE fix to be live. BE is `tsx watch`.
9. **Peer2's machine is OFFLINE** (last heartbeat 2026-07-04 23:09 UTC) — out of scope this run. Its
   hard no-delete rule stands if it ever returns.
10. **The client production server (`139.180.129.185`) is OUT OF SCOPE.** Do not touch it.

## 7. Out of scope / answered

- **Android emulation:** possible (KVM present on `.140`), but the emulator replaces the device audio HAL
  — the prime suspect. It would not reproduce the freeze. **Skipped.** The real path is driving JROM's
  Android tablet over `adb`, when he has a moment.
- **Long-haul leg:** unavailable. SG is 37 ms (near-region); Peer2's US box is offline.
- **T1 (why the Android capture froze):** remains **OPEN**. This run proves detection and recovery of the
  *symptom*; it cannot pin the *cause*.
