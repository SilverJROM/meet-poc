# Deliberation Round 1 — T1: Persistent mic-silence self-heal (R1)

You are one of two co-planners (the other is [Opus / Codex 5.5] in a separate session) debating
this item with projcore (coordinator) before any implementer touches code. Read the full anchor
first: `plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-03/deliberation/T1-mic-silence-retry/anchor.md`
(absolute path from repo root `/home/agjrom/websites/meet-poc/`).

Read the actual current code before proposing anything:
- `frontend/src/app/services/mic-energy.ts` (full file, especially `nextSweepGate` ~line 323
  and the classifier ~line 161)
- `frontend/src/app/pages/room/room.page.ts` lines ~3750-3860 (the watchdog + sweep orchestration)
- `frontend/src/app/pages/room/room.page.html` ~line 195-210 (the banner)

## Your task
Independently propose a concrete technical approach for R1 (see anchor "what the deliberation
must resolve," 5 numbered questions). Do not just restate the anchor — commit to specific
answers:
1. Exact retry mechanism (what changes in `nextSweepGate` or its caller, with file:line targets).
2. Exact bound (max attempts / max wall-clock / backoff shape) — pick real numbers.
3. Full-resweep-every-cycle vs retry-last-candidate-first-then-backoff-to-full-sweep — pick one,
   justify.
4. Banner copy/urgency change — yes/no, and what if yes.
5. How you avoid double-recovery with the existing `devicechange`/track-`ended` handlers.

End your reply with:
- **PROPOSED:** <2-3 sentence summary of your approach>
- **REDTEAM-CANDIDATE:** YES or NO + one-line reason.

This is round 1 of up to 3. After both co-planners reply, projcore will share both proposals
with each of you for round 2 if you disagree. Reply as plain text — no code changes yet, this is
planning only.
