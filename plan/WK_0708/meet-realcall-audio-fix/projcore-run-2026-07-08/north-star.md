# Effort North-Star — Restore real-call audio (volume-vs-mic regression)

> **Effort-scoped.** INHERITS + cites the project constitution
> `/home/agjrom/websites/meet-poc/north-star.md` (does not copy it). **APPEND-ONLY** within this run —
> dated entries, never retcon. Archived with the run.

---

## 2026-07-08 — Frontload (bootstrap author: /north)

**Inherits from project north-star:** §2 near-term = rock-solid real-call app; §4 real-call acceptance
bar (gated exit); §6 standing decisions (SFU cutover, FE-must-rebuild, STUN-only, SFU role-inversion:
Claude implements / codex validates); §8 verification standards (intl-path, test hygiene, Peer2-machine
rule).

**The north for THIS effort:** a **real client call works again — both directions of audio, screen
share, and video — without regressing the quiet-voice fix that started this.** That is the entire win
condition. Nothing else ships in this effort.

**Why it matters (the stakes):** ReceiptBOT/Acctg is a **real client, 1–2 calls/week, essential.** Today
the call failed hard enough that JROM fell back to Google Meet. The app is, in JROM's words, "not at a
good working condition right now." This is the #1 thing standing between the app and its own north-star.

**The uncomfortable truth this effort must honor:** a fix we shipped for "too quiet" produced "no audio
at all." And a projcore run marked 10 voice batches "verified" (2026-07-05) while a real call still
failed. So this effort is not just a code fix — it is a **proof-discipline reset**: we diagnose the real
mechanism (not assume), and we validate on a **real call** (Android tablet → live client), because that
is the only bar the project north-star accepts.

**Sequencing (JROM-directed):**
1. **Understand & frame** (this /north pass) — DONE: evidence gathered, problem + acceptance captured.
2. **Planning** — a **proper cross-provider deliberation** (codex-5.5 + sonnet-5 + grok-build + opus) to
   pin the true root cause and design the fix. `planning_criticality: critical` (JROM: "for the planning
   i recommend we do a proper deliberation"). See `topology.yaml`.
3. **Implement + validate** with the team, against AC8 (real-call proof).

**Standing constraints carried in:** no access to the client device (Android tablet is the pre-live
retest surrogate); pre-live deferral OFF; FE must be rebuilt to ship; R1 self-heal is unmerged.

**Leading suspect, NOT a conclusion:** the volume-standardization change. Held as a hypothesis for the
deliberation to prove or kill — the published mic track appears to be the raw gUM track, so the causal
mechanism is genuinely open (og-requirements §5, T1).

**Candidate promotion to the project north-star (pending JROM approval, do NOT auto-promote):** "audio
changes must be proven on a real cross-device call before being marked done — synthetic verification of
an audio fix is insufficient by policy." This regression is the evidence for making that a standing law.
→ **APPROVED + curated into project north-star §6 on 2026-07-08.**

---

## 2026-07-09 — Run close: what shipped, what did NOT, and why the run stalled (author: /north)

**Outcome:** the coordinator run (`lkvcgrok`, workflow 134) was **stopped by JROM after ~9.5h**, with
3 of 8 ACs verified. The one real code change was rescued from an uncommitted working tree and committed
as `856104f` on branch `batch-01-diagnosis-2026-07-08`. It is **live on dev** (bundle rebuilt 13:02 UTC,
served by `voice.silverjrom.app`). It is **not on `main`** — correctly, per §6 of the project north-star:
an audio fix does not land until a real cross-device call proves it.

**What the fix actually is (scope, stated precisely):** a **detection** fix in `classifyMicCapture`
(`frontend/src/app/services/mic-energy.ts`). A frozen non-zero mic level (the real-call signature: level
pinned at exactly `0.228949858088931`, zero variance, `micSilent=0`) is now classified **silent**, so the
R1 self-heal can fire. Previously the magnitude-only detector was fooled and the self-heal — gated on
`micSilent=true` — could never trigger. This closes **Mode A** (the ~3-minute dead-mic-that-looked-fine).

**What the fix is NOT — open thread T1 remains OPEN.** The run's `validation/b01-diagnosis.md` labels the
detector blind spot "root cause." **It is not.** The blind spot explains why we *failed to notice* the
dead mic; it does not explain **why the Android capture froze in the first place.** The leading suspect
(volume standardization) was never proven or killed — a first pass showed `doPublish` publishes the raw
gUM track (`localStream.getAudioTracks()[0]`, no `MediaStreamAudioDestinationNode`), so the causal
mechanism is still unestablished, and the logged balancer issue still reads "LOGGED, NOT STARTED (R5)."
Two things therefore remain unproven and are exactly what JROM's real-call test must decide:
- whether the self-heal, once correctly triggered, **actually recovers** the Android capture (AC4); and
- whether **Mode B** (`micSilent=1`, level 0, never recovered) is a distinct failure needing its own fix.

**The planning deliberation never ran.** `planning_criticality: critical` was stamped precisely so the
cross-provider panel would pin T1 before anyone patched (D2/D3). The run patched first. That inversion is
the reason the diagnosis is thin, and it is the substantive process failure of this effort — larger than
the wall-clock waste.

**Why the run circled (~6h idle after 16:10 UTC):** a **contradictory exit condition authored by /north**
— "drive to ready-for-JROM-to-test" AND "deferral OFF, do not complete until the queue is empty." The
remaining ACs (AC1, AC4, AC5, AC6, AC8) are **real-call / real-device gates that projcore structurally
cannot perform.** The queue could therefore never empty, so instead of declaring ready-to-test and
stopping, the coordinator sat at its home screen re-syncing OVM. Not a model failure — a spec defect.
This is /north's error, logged against /north.

**Candidate promotions to the project north-star (pending JROM approval, do NOT auto-promote):**
1. **Human-owned acceptance gates are first-class.** Any AC that requires a real device, a real call, or
   a human ear/eye must be tagged `owner: JROM` in `og-requirements.md`. Deferral=OFF applies only to
   agent-ownable ACs. A run's exit condition is "all agent-ownable ACs closed → notify ready-to-test →
   **stop**," never "queue empty."
2. **Diagnosis before patch on a `critical` effort.** When `planning_criticality: critical` stamps a
   deliberation panel to pin root cause, no implementer batch dispatches until the panel returns. A
   "root cause" claim that names the *detector* rather than the *mechanism* fails the gate.
