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
