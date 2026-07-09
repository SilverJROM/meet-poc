# Effort North-Star — Automated voice fix→test loop (run 2026-07-09)

> **Effort-scoped.** INHERITS + cites the project constitution
> `/home/agjrom/websites/meet-poc/north-star.md` (does not copy it), and continues the effort
> `meet-realcall-audio-fix` whose first run (`projcore-run-2026-07-08`) was **stopped by JROM** after
> circling. **APPEND-ONLY** within this run — dated entries, never retcon.

---

## 2026-07-09 — Frontload (author: /north)

**Inherits from project north-star:** §2 near-term = rock-solid real-call app; §4 real-call acceptance
bar; §6 standing decisions (SFU cutover, FE-must-rebuild, STUN-only) **including the promoted law:
an audio fix is not "done" until proven on a real cross-device human call**; §8 verification standards.

**Carried forward from run 2026-07-08 (see its north-star + decisions):**
- The one code change that shipped — `856104f`, a **detection** fix in `classifyMicCapture` (frozen
  non-zero mic level now classified silent so the R1 self-heal can fire). Live on dev, unmerged.
- **Open thread T1: the true root cause of the Android capture freeze was never pinned.** The prior
  run's `b01-diagnosis.md` misattributes the detector blind spot as the root cause. It is not.
- The prior run circled ~6 hours on an **unsatisfiable exit condition**. Fixed here (see below).

## The north for THIS run

Build a **fully automated fix→test loop** that hardens the voice stack against every failure mode we
*can* reproduce on desktop hardware, and leaves the app **ready for JROM's real-call test.**

JROM tests *after* completion. Nothing in this run waits on him.

## The win condition (bounded and satisfiable — this is the fix for the last run's circling)

The run is DONE when **either**:
- **(a)** one clean **3–5 minute** conversing call **and** one clean **10-minute** final gate, **or**
- **(b)** the **25-call budget** is exhausted.

Then: **STOP**, notify, shut down `dev_machine`. There is no third state, and no gate waits on a human.

## What "DONE" means, precisely

**DONE = the automated loop completed and the app is ready for JROM's real-call test.**
It does **NOT** mean the client's bug is fixed. Both loop endpoints are desktop Chromium; the Acctg
failure was an **Android capture freeze**, whose *cause* we cannot reproduce (only its symptom).
The completion notice must say "ready for real-call test," never a bare "fixed."

**Corollary:** `batch-01-diagnosis-2026-07-08` does **not** merge to `main` in this run. Project
north-star §6 gates that merge on JROM's real cross-device call proof. This is the guardrail that
prevents a third false-green (the 3-machine gate went GREEN on 07-05 while the real call failed 07-08).

## The two things this run proves that no prior run even attempted

1. **The recording is the arbiter, not the telemetry.** Every acceptance criterion is measured from the
   **receive-side audio recording** (RMS/LUFS, transcription), not from WebRTC stats. Stats are exactly
   what lied on 07-08 — `audioLevel` read `0.228949858088931` while the mic was dead. A bot that must
   actually *transcribe the words the other side spoke* cannot be fooled by a frozen stat.
2. **Forced, verified stimulus.** Weak signals are injected at an exact level via a harness-side
   `getUserMedia` shim (a `GainNode` downstream of Chrome's audio processing), and the injection is
   **verified** before any assertion. If AGC swallows the attenuation, the test is **INVALID, not PASS.**

## Standing constraints carried in

- **The harness must not manufacture the failures it hunts.** Bots speak on a fixed clock from
  pre-generated audio; the LLM runs **async** and never gates speech. A slow brain's silence is
  indistinguishable from a dead mic.
- **Fix locally, always.** SG is confirmation-only and is never iterated on.
- **Conserve resources.** codex55 is at 4% weekly headroom — ration it. Prefer cheap tiers. No elite
  red-team unless a fix fails twice.
- FE must be rebuilt (`ng build`) to ship. BE is `tsx watch`.
- `dev_machine` is shut down when the run ends or when not in use.

## Leading suspects, NOT conclusions

- The **`AUTO_LEVEL_MAX_GAIN = 2.5` cap** may make JROM's 70–75% amplification bar unreachable for any
  peer quieter than `r ≈ 0.30` of the loudest (from `min(2.5·r, 0.88)`). **Derived from reading
  constants, not observed.** The forced sweep confirms or kills it.
- The ease-in complaint is probably **not** duration (measured ~9s to 90%, inside JROM's 10s ceiling)
  but **discontinuity** — `applyVolumeState` writes `gain.gain.value` directly, a +3.7dB step on the
  first 1.5s tick. Fix the ramp mechanics, not the speed.

Both are hypotheses handed to the co-planners. Neither is a conclusion.

## Candidate promotions (pending JROM approval, do NOT auto-promote)

1. **Human-owned acceptance gates are first-class.** Any AC requiring a real device/call/human ear is
   tagged `owner: JROM`; `deferral=OFF` binds only agent-ownable ACs; a run exits on "all agent-ownable
   ACs closed → notify ready-to-test → **stop**," never "queue empty."
2. **Audio assertions are made on recorded audio, never on WebRTC stats alone.**
