# Briefing Packet — projcore SUB-MODE

**From:** `/north` (Claude Code main session, 2026-07-09) · **To:** grok-4.5 projcore, session `lkvcgrok`

You are running **SUB-MODE** (`~/.grok/agents/projcore.md` + the coordinator layer). The strategy docs are
**pre-authored**. Do **NOT** run a Phase-0 interview. Do **NOT** author a north-star. Read the docs,
validate the topology contract fail-closed, delegate planning to the 2 co-planners, and conduct the loop.

## Paths

- `run_dir`: `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`
- `north_star`: `<run_dir>/north-star.md` (effort) → inherits `/home/agjrom/websites/meet-poc/north-star.md` (project constitution)
- `og_requirements`: `<run_dir>/og-requirements.md`  ← **your Q0 anchor + req-matrix seed**
- `decisions`: `<run_dir>/decisions/2026-07-09-harness-team-and-scope.md` (D14–D26)
- `topology_contract`: `<run_dir>/topology.yaml`
- **Prior run (read for context, do not resume):** `../projcore-run-2026-07-08/` — its
  `validation/b01-diagnosis.md` **misattributes the root cause**; see that run's north-star §2026-07-09.

## Run identity

- `coordinator_session`: `lkvcgrok` (JROM: OVM recognizes this name; it intentionally breaks the `x-`
  prefix. **Child sessions MUST comply:** `x-01_<function>_<model>_meet`.)
- `run_num`: `01`
- `planning_criticality`: **high** (co-planners deliberate; panel per-batch on capture-path batches only)
- `north_author_session`: the Claude Code **main session** that authored these docs. It is **NOT
  tmux-addressable**. For a strategy consult, write `<run_dir>/callbacks.md` and continue; /north polls it
  on its 45–60 min check-in. Do not block on /north.
- **projcore OWNS its OVM run** (no parent-label). `/north` reports nothing to OVM.

## Mission (one sentence)

Build a **fully automated fix→test loop** between `.140` and `.123` that hardens the voice stack against
every failure mode reproducible on desktop hardware, then leave the app **ready for JROM's real-call test.**

## Non-negotiables (read `og-requirements.md` §6 in full)

1. **The recording is the arbiter.** Every AC is proven from receive-side **audio recording / transcript**.
   WebRTC stats may corroborate; they may never decide. Stats lied on 07-08 (`audioLevel` read
   `0.228949858088931` on a dead mic).
2. **INVALID ≠ PASS.** If a forced weak signal was swallowed by AGC, the stimulus never reached the system
   under test. That is a third verdict and it must exist in the code.
3. **The harness must not manufacture failures.** Bots speak on a **fixed clock** from **pre-generated
   audio**; the LLM is **async** and never gates speech. A slow brain reads as a dead mic.
4. **Do not slow the ease-in ramp.** It already reaches 90% in ~9.0s. The defect is the **+3.7 dB
   discontinuity** on the first tick, not the duration. (D18)
5. **Verifier ≠ fixer at every tier.** sonnet is implementer L3 *and* the validator fallback: a task
   sonnet implemented must **never** be validated by sonnet. Fail-closed error.
6. **No merge to `main`.** Gated on JROM's real cross-device call (project north-star §6).
7. **Fix locally.** SG is confirmation-only and is never iterated on.
8. **Conserve.** codex55 ≈4% weekly headroom → ration; fall open to sonnet and **say so** in the report.
   Red-team `budget` by default; `elite` only after a fix has failed twice.
9. **Hygiene guardrail.** Delete only harness-created sessions/rooms, matched by IDs captured at creation.
   **Never** session `652c1475`. **Never** room `TEST_ROOM01` (`testroom01001`). No wildcard sweeps.
10. **Out of scope, do not touch:** the client prod server `139.180.129.185`; Peer2's machine (offline);
    Android emulation (answered + skipped, D22).

## Exit condition (bounded — the prior run circled ~6h on an unsatisfiable one)

**DONE ⇔ (clean 3–5 min conversing call **AND** clean 10-min final gate) **OR** the 25-call budget is
exhausted.** Then **STOP**, write the report, notify, and **shut down `dev_machine`** (AC14).

- 25 calls of 3–5 min **burn** (including harness-caused aborts).
- 10-min gates **do not burn**, capped at **5**.
- **No gate waits on JROM.** He tests after completion.
- Completion wording: **"ready for JROM's real-call test"** — never a bare "fixed."

## Escalation

impl bug → implementer (≤3 iterations) · plan defect → co-planners (JIT) · strategy gap → write
`<run_dir>/callbacks.md`, keep working. Auto-promote to the co-planners on repeated fail / non-convergence.
Notify JROM (Telegram protocol) only on **DONE** or **BLOCKED/URGENT** — never progress or FYI.

## First actions

1. Read `north-star.md`, `og-requirements.md`, `decisions/`, `topology.yaml`. **Validate the contract
   fail-closed (7 rules).** Any unresolvable role → request a corrected `topology.yaml` via
   `callbacks.md`; do **not** guess. Note `implementer.L1` is an **A/B alternation** (spark ↔ grokcompose,
   start with spark) — record per-task model + outcome in `progress.md` for JROM's comparison.
2. Register the OVM run under session `lkvcgrok`.
3. Spawn the 2 co-planners (opus + codex55) → they deliberate the pre-authored docs into an **ATOMIC**
   `plan.md` (<30 min tasks), annotating every batch with `impl_tier`, `validator_tier`, `deliberation`,
   `redteam`. Tag the **capture-path** batches (gUM shim, AudioParam ramp, `mic-energy`,
   `remote-audio.service`) `deliberation: yes`, `redteam: standard`, `impl_tier: L3`.
4. **Phase 0.5 plan handshake:** post `STATUS: PROPOSED` → structural check (atomicity / 95-5 / tiers) →
   `APPROVED-PLAN` → begin. `/clear` between batches.
5. **Environment is already provisioned — do not reinstall.** dev_machine (`192.168.254.123`, WoL via
   `python3 /home/agjrom/websites/local_dev/wake-123.py`) has: llama.cpp built
   (`~/llama.cpp-src/build/bin`), models `Qwen2.5-{0.5B,1.5B,3B}-Instruct-Q4_K_M.gguf` in
   `~/agent-gateway/models/`, and `~/voicesim/` with `bin/whisper-cli` + `models/ggml-base.en.bin` +
   `piper/piper` + `voices/en_US-amy-medium.onnx`. Verified: piper→whisper round-trip transcribed
   verbatim in 772 ms. **llama throughput is UNMEASURED** (the benchmark hung; use the HTTP server on
   `:8080`, not `llama-cli`). Playwright Chromium, Xvfb, PipeWire, ffmpeg, node 24 all present.
   Ops guide: `/home/agjrom/websites/local_dev/dev_machine.md`.
6. Branch: work on **`batch-01-diagnosis-2026-07-08`** (consolidated main + fix `856104f`). FE changes
   require `ng build` to be live on DEV (`https://voice.silverjrom.app`).
