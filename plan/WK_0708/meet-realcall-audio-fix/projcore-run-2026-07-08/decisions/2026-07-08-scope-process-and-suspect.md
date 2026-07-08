---
source: north
date: 2026-07-08
effort: meet-realcall-audio-fix
priority: high
search_hooks: [volume balancer, mic silent, one-way audio, android, regression, real-call acceptance, deliberation, verified but failed]
---

# Decisions — scope, process, and the leading suspect (frontload)

## D1 — Win condition = full real-call AV, no quiet-voice regression
**Question:** what does "fixed" mean for this cycle?
**JROM verbatim:** "just fix it both can hear each other and anyone can share screen and view each other
on the app."
**Decision:** scope is bidirectional audio + screen share + video, proven on a real call, **AND** the
original quiet-voice remedy must still hold (AC7). We do NOT simply revert the volume work — we fix the
mic regression while keeping quiet participants audible. Both tensions are in scope together.

## D2 — Diagnose, don't assume: root cause is a planning-deliberation deliverable
**Decision:** the volume-standardization change is the **leading suspect by timeline only.** A first pass
shows the published mic track is the raw gUM track (no outbound WebAudio graph), and the logged balancer
issue reads "NOT STARTED" — so the mechanism is unproven. The true cause (T1) is pinned during planning,
not asserted now. This protects against anchoring the whole team on a wrong cause.

## D3 — Proper cross-provider deliberation at planning; NOT before
**Question / trigger:** JROM initially said "please deliberate this with codex55 and sonnet5, grok build,"
then corrected: **"dont do deliberation yet... for the planning i recommend we do a proper deliberation."**
**Decision:** no deliberation during the understand/framing phase (a premature 3-agent panel was launched
and immediately **stopped** on JROM's correction). The deliberation is reserved for the **planning
phase** and is **cross-provider** (codex-5.5 + sonnet-5 + grok-build + opus). Stamped as
`planning_criticality: critical` → the deliberation panel auto-engages to harden the plan. Both `codex`
and `grok` CLIs are confirmed reachable on this box.

## D4 — Real-call acceptance, bounded by device access
**Decision:** "verified" pre-live = passes on **JROM's Android tablet** (the surrogate for the client's
Android phone, which we cannot access). Final proof = **holds on the next live ReceiptBOT client call.**
No synthetic-only sign-off (project north-star §4). This bounds how far we can prove before the client
call — accepted and explicit.

## D5 — Media/SFU role convention applies
**Decision:** this is media/capture work → project north-star §6 role-inversion applies: **Claude
implements, codex validates.** Reflected in `topology.yaml` (implementer biases Claude tiers;
validator L2 = codex55). Logged so projcore doesn't invert it.

## D6 — Process reconciliation is in scope (T3)
**Decision:** part of this effort is understanding **why the 2026-07-05 run marked voice batches
"verified" while a real call failed** — an evidence-quality gap. The fix must be proven the right way, and
the finding feeds a candidate promotion (effort north-star): audio fixes require real cross-device call
proof by policy.

## D7 — Test-machine topology (JROM directive, 2026-07-08)
**Decision:** validation runs on **the dev machine first**; once **dev calls are good**, **add the SG
(Singapore) machine** as the long-haul / international leg (RTT ≥150ms real path, per project north-star
§8). Real-call proof still culminates in JROM's Android tablet + the live ReceiptBOT client call (D4).
**Ops rule:** **shut down `dev_machine` when not in use / when done** (cost/hygiene). projcore must
respect this in its validation orchestration and teardown.

## D8 — Coordinator = grok projcore, session `lkvc-grok`
**Decision:** the execution coordinator is **grok projcore** launched in tmux as session **`lkvc-grok`**
(carried in the briefing packet + topology.yaml). co-planners codex55/opus; deliberation panel (critical)
codex55+sonnet5+grokbuild+opus.

## D9 — Implementer/validator routing override (JROM, 2026-07-08)
**Decision:** JROM explicitly routed the roster, overriding the SFU §6 "Claude-implements" default:
implementer **L1 spark/grokcompose · L2 grokbuild · L3 sonnet**; validator **codex55**, backup **opus**
when codex55 weekly headroom < 2%. Stamped in `topology.yaml`. Logged so projcore honors it verbatim.

## Resolved (were deferred; JROM confirmed 2026-07-08)
- **planning_criticality:** CONFIRMED `critical` (auto-engage the deliberation panel).
- **Effort folder:** MOVED to `plan/WK_0708/meet-realcall-audio-fix/` (fresh weekly, JROM: "fresh 0708").
- **Promotion of the "real-call proof for audio fixes" law:** APPROVED — curated into project
  north-star §6 (2026-07-08).
- **Merge/branch consolidation:** APPROVED — deployed working-tree source committed as the main baseline
  (fixed-forward, NOT a revert); scratch (`rec-harness.mjs`, `callbacks/`, `validation/*.md`) left out;
  stale merged branches retired. See run start-state.
