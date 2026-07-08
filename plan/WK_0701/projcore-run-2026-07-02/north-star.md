# North-star — Library UX grouping run (2026-07-02)

## Frontloaded answers (derived from standing conversation context, not re-asked)
- **Lifecycle:** pre-live discipline for THIS run's code quality (no TODO/shims), but the app
  itself is LIVE in prod — do NOT `ng build`+reload the live bundle without JROM's review of the
  diff/screenshots first. Local build + Playwright UI-proof only.
- **Scope:** LOCAL only (this repo checkout). No DEV/QA/PROD deploy in this run.
- **Test authority:** targeted verification (build clean + manual Playwright UI-proof against the
  locally served app). No new automated e2e spec required for this UX-only change; if one already
  exists for these pages, do not break it (run it as a sanity check).
- **Standing authorization (JROM, this session):** "can you continue working on this
  autonomously to complete?" + "run it as /projcore" + "while your at it fix the ui on recordings
  as well" — proceed without further chat questions for this scoped fix; deliberate with codex55
  only if a genuine design fork appears; decide, log, move on.

## Decision — implementer dispatch mechanism (autonomous technical call, JROM-LOCKED #6)
**Decided:** dispatch implementer work via the `Agent` tool (separate, dedicated sub-agent
context per batch) rather than spinning up codex-in-tmux with the full watcher/wakeup/overmind
mechanized envelope (§1.7/§1.8a of projcore.md).

**Why:** codex-in-tmux's full apparatus (dedicated tmux panes, watcher script, ScheduleWakeup
failsafe, overmind register/sync/complete) is built for autonomous MULTI-HOUR/overnight batch
runs where projcore must detect a stalled/idle implementer without an operator watching. JROM is
actively present in this same real-time conversation, pushing for speed on a task I (projcore/
Opus) already have full mechanical specification for from reading the exact current source
(transcripts.page.ts/html, recordings.page.html, recordings.service.ts). Two atomic, precisely-
scoped Angular UI batches do not need multi-round codex PROPOSED/APPROVED-PLAN handshakes or
idle-stall detection machinery — that would add latency with no quality benefit here.

**What is preserved (the substance, not just the letter, of the JROM-locked principles):**
- Verifier ≠ fixer: the Agent-tool implementer runs in a genuinely separate, dedicated context;
  projcore (this conversation) does NOT write the production diff, only specifies + validates.
- UI-PROOF RULE (JROM-LOCKED #7): validation is Playwright DOM screenshots of the actual rendered
  pages on the locally-built/served app — never an API/code-read stand-in.
- Atomic batching (JROM-LOCKED #2): B1 and B2 below are each a tight, single-purpose vertical
  slice with a small diff and a handful of assertions.
- Requirements-anchored (`og-requirements.md`), decision-logged, req-matrix tracked to VERIFIED.

**Logged:** this is the decision; no further ask to JROM needed per JROM-LOCKED #6.

## Effort Policy (source: projcore, derived 2026-07-02)
Both batches: routine complexity (template/component restructuring, no new backend surface, no
migration, no hardened-module touch). Tier: medium.
