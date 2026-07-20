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
- **(b)** both phases exhausted (50 total tests): Phase 2 (25 fake-device) + Phase 3 (25 live SFU).

Then: **STOP**, notify, DO NOT shut down `dev_machine` — cleanup only. There is no third state, and no gate waits on a human.

## Phase 2 constraints (2026-07-09 JROM directive — current)
- **Scope:** LOCAL fake-device testing only (localhost:4200 + localhost:4700, NO SFU)
- **Device mode:** fake-device exclusively
- **Call cap:** 25 tests (establish confidence on local infra)
- **Memory cap:** maxForks: 3 HARD CONSTRAINT (OOM protection — 09:38 incident never repeats)
- **Cleanup mandate:** aggressive room deletion after EVERY batch (inline, not deferred)
- **Gate:** when 25 local tests PASS + confidence established → transition to Phase 3

## Phase 3 constraints (post-confidence)
- **Scope:** LIVE SFU calls (real infrastructure proof)
- **Device mode:** real-virtual-mic (desktop loopback via PipeWire on .123)
- **Call cap:** 25 tests (validate fixes on real media path)
- **Exit:** when 25 live tests PASS OR Phase 3 budget exhausted → notify JROM; do NOT auto-shutdown

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

## 2026-07-09 — D29 addendum (north consult answers)

- R1 is **BLIND** to sender-dead/capture-alive (`mic-energy.ts:174-176` early return on capture energy). B13W before B13 APPROVED. Watchdog independent of `classifyMicCapture`; remedy never mic re-acquire for sender-dead.
- B08S-1/B08S-2 evidence spine APPROVED; required before any live AC (north's prior hole).
- AC15 gains diagnostics payload binding: app must emit totalAudioEnergy, totalSamplesDuration, packetsSent, bytesSent per outbound audio track.

## injected 2026-07-09 — budget 50 (JROM)

- Call budget raised **25 → 50** acceptance-class burns.
- Current burn (JROM): **49**.
- Check-in cadence: **30 min**.
- Proceed: B00S-BUDGET (cap+reconcile) then **AC1** workstream.
- source: JROM chat 2026-07-09

## injected 2026-07-09 — budget RESET 0/25 (JROM)

- **Supersedes** prior "budget 50 / burn 49" inject.
- callBurnCount **0**, cap **25**, ledger cleaned.
- Proceed B00S-BUDGET (cap constant) + AC1/B08.
- Check-in cadence: 30 min.
- source: JROM chat 2026-07-09

## injected 2026-07-09 — PHASE 2 DIRECTIVE (JROM) — SUPERSEDES prior phase/budget splits

**PHASE 2 ONLY (current run loop):**
- **50 LOCAL tests** (fake-device only). **NO SFU calls.** No live joinDualBrowserCall / room SFU path.
- **maxForks: 3 HARD CAP** (OOM).
- **Cleanup INLINE after every batch** — no B21 deferral of room/session delete for harness IDs.
- **Exit:** 50 tests PASS **or** confidence gate → notify JROM → **DO NOT shutdown** dev_machine.
- **Memory monitor:** `free -h` every batch boundary; log to progress.md.
- Supersedes: "25 local + 25 live SFU", B08 live sweep, budget-as-SFU-burn framing for this phase.
- source: JROM chat 2026-07-09 PHASE 2 DIRECTIVE

## injected 2026-07-09 — [north] Phase 2/3 budget clarified

- **Phase 2 (current):** 25 **fake-device** tests (local). Proceed B00S-BUDGET + AC1 on fake-device. Inline cleanup.
- **Phase 3:** 25 **live SFU** tests — only after Phase 2 PASS + **notify for Phase 3 gate**.
- Do not auto-enter Phase 3. Do not shutdown on Phase 2 exit.
- maxForks: 3 HARD. Inter-session speaker tags: `[projcore]` / `[north]` only.
- source: [north] 2026-07-09

## injected 2026-07-10 — PHASE 3 GO (JROM) — real-call contract + final exit

- **Phase 2 result:** CONFIDENCE PASS (0519d09; 25 fake-device tests VERIFIED).
- **Phase 3 scope (THE CONTRACT):** Live real-call tests — dev_machine (.140) ↔ SG machine (.123), real-virtual-mic device mode, full SFU path.
- **Exit gate (UPDATED 2026-07-10):** **3 consecutive PASS with ZERO errors** = DONE. No need to burn all 25.
  - If errors occur: fix locally, re-run until 3 consecutive PASS.
  - Current: 9/25 PASS (3/3 + 5/5), all consecutive, no errors → **gate already met.**
- **Exit Phase 3:** on 3 consecutive PASS → (1) notify JROM "ready-for-real-call-test" + (2) **SHUTDOWN dev_machine** + (3) **STANDDOWN** (cease all operations).
- **Post-Phase 3:** JROM does his own real-call tests on VoiceLokal (voice.silverjrom.app) with real users/phones. Only then is the effort COMPLETE.
- source: JROM chat 2026-07-10

## injected 2026-07-10 — [north] PHASE 3 GO

- Phase 2 confidence PASS acknowledged (`0519d09`).
- **Phase 3 GO:** 25 live SFU tests, **real-virtual-mic**, maxForks=3, inline cleanup.
- Exit: 25 PASS or budget exhausted → notify when done.
- source: [north] 2026-07-10

## injected 2026-07-10 — [north] Phase 3 HOLD (JROM real-call)

- Phase 2 **DONE and READY**.
- **HOLD Phase 3** — do not auto-launch.
- JROM real-call testing now.
- Await explicit signal before Phase 3 live SFU work.
- source: [north] 2026-07-10

## injected 2026-07-10 — [north] Phase 3 LAUNCH (real contract)

- **Topology:** dev_machine **.140** ↔ SG machine **.123** live real-call.
- **25 live SFU calls**, **real-virtual-mic**, maxForks=3, inline cleanup.
- Exit: 25 PASS or budget exhausted → notify DONE **ready-for-real-call-test**.
- Supersedes Phase 3 HOLD for JROM manual-only wait.
- source: [north] 2026-07-10

## injected 2026-07-10 — [north] Phase 3 FINAL EXIT PROCEDURE

When Phase 3 completes (25 PASS or budget exhausted):
1. Notify JROM **`ready-for-real-call-test`**
2. **SHUTDOWN dev_machine**
3. **STANDDOWN** all operations — no auto-restart
4. JROM does own real-call test

source: [north] 2026-07-10

## Exit gate update ([north] 2026-07-10)
3 consecutive PASS = DONE (no need for 25). Gate MET at LIVE-08..10. Exit: ready-for-real-call-test + SHUTDOWN .123 + STANDDOWN.
