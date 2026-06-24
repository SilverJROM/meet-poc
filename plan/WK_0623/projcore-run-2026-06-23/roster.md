# Run roster — WK_0623 projcore run

> Presented to JROM for greenlight 2026-06-23 (v2 — implementer routing + deliberation + red team).
> Topology: coordinator ≠ implementer ≠ validator. **Verifier ≠ fixer** enforced per batch. One batch at a
> time. No dispatch until JROM's explicit "go".

## Core team

| Role | Who | Model / effort |
|------|-----|----------------|
| **Coordinator + final gate** | projcore (this session) | Claude **Opus 4.8** |
| **Co-planner** | **codex55** (`lkvc-codex55`) | codex **gpt-5.5** |
| **Standing validator** | **codex55** (independent of the fixer) | codex **gpt-5.5** |

## Implementer routing (fixer) — JROM-specified
1. **grok composer** (Composer 2.5 Fast) — **primary** for most batches (fast).
2. **grok build** (`lkvc-grok`, --always-approve) — **backup** (composer stalls / busy / struggling).
3. **Sonnet 4.6** (via a `/lead` tmux child, /effort medium→high) — **complex batches** (B3 auth, B5 teardown).

Routing is per-batch; projcore picks 1→3 by complexity and escalates to backup on stall.

## Deliberation panel (plan design — when a plan is "much more complex")
Independent approaches → cross-critique → converge on one plan; projcore synthesizes.
- **Members:** codex55 (gpt-5.5) + Sonnet + grok build (diverse models for genuine divergence).
- **Trigger (projcore's judgment):** wide solution space / architectural fork. Applies to **B3** (passwordless
  auth flow), **B5** (streaming-upload vs block-teardown), **B1** (provider seam + versioning). Skipped for
  simple batches (**B2** CRUD-ish, **B4** small UI).

## Red team (adversarial validation — high-prio + complex)
Independent skeptics each try to BREAK the implementation (security bypass, data loss, edge cases, real-call
fidelity); majority-refute kills a claim. Escalate to Opus for tiebreak/deep-dive.
- **Members:** codex55 (gpt-5.5) + Sonnet + **Haiku 4.5** + **Spark** (xAI), each with a distinct lens
  (security / data-integrity / real-shape / fast-edge-sweep); **Opus tiebreak**. Majority-refute kills a claim.
- **Trigger:** **B5** (silent data loss — HIGH), **B3** (auth/security), **B2** (hidden-superuser protection /
  auth bypass). Routine batches (**B4**, and **B1** unless flagged) get standard validation (codex55 + projcore).

### verifier ≠ fixer constraint (hard rule)
On any batch where **Sonnet is the implementer**, Sonnet is **excluded** from that batch's deliberation-result
validation and red team — red team becomes codex55 + grok build + Opus. The fixer never validates its own work.

## Per-batch plan

| Batch | Implementer | Deliberation | Red team | Notes |
|-------|-------------|--------------|----------|-------|
| **B5** recording loss (HIGH) | Sonnet (complex) | ✅ yes | ✅ yes | data loss; streaming vs block-teardown fork |
| **B1** transcription | grok composer | ◻ light | ◻ optional | provider seam + versioning |
| **B2** superuser god-mode | grok composer | ✕ no | ✅ yes | security: hidden-superuser protection |
| **B4** cam-off background | grok composer | ✕ no | ✕ no | small UI + small signaling field |
| **B3** passwordless TG (HIGH) | Sonnet (complex) | ✅ yes | ✅ yes | auth/security; own sub-run; T0 webhook spike |

## Cadence (projcore v2.3)
Phase-0.5 plan handshake (codex55 + projcore agree → APPROVED-PLAN; deliberation panel first if complex) →
dispatch one batch to the implementer → watch (exit-5 idle, time-budget caps) → validate (red team if flagged
→ codex55 → projcore gate, independent) → go/no-go → context hygiene + /clear → next batch. Loop while queue
non-empty.

## Proposed build order
**B5 first or right after B1** (silent data loss), then **B1 → B2 → B4 → B3**.

## Scope / not-in-run
DEV/local only (prod stays /lead + deployer); no CFBASE; `OPENROUTER_API_KEY` optional (local Whisper free).

## Sessions on greenlight
- grok composer implementer: a fresh tmux session (e.g. `meetpoc-impl-grokcompose`).
- grok build backup: `lkvc-grok` (live). Sonnet implementer: a `/lead` tmux child when a complex batch needs it.
- codex55 co-planner/validator: `lkvc-codex55` (live).
