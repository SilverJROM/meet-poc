# Queue — Voice Standardization & Reliability (WK_0701, 2026-07-03)

Dynamic (§1.4b): JROM may inject issues mid-run; drained at batch boundaries.
Order = reliability first, then features, then low-severity cleanup (JROM 2026-07-03).
Each batch's approach is locked only after its per-item 3-way deliberation
(codex55 + Opus-planner + coordinator) concludes — queue order is fixed, batch CONTENT may be
refined by that deliberation before dispatch.

- B1 [done] — Keep retrying to fix a dead microphone instead of giving up after one try
  - req: R1 · VERIFIED · commit d2cbce9c69edd0842169b1a5b28bb09bb142adb0 on feat/voice-standardization-batch-1-mic-silence-retry
  - deliberation: DONE (2 rounds) — deliberation/T1-mic-silence-retry/consensus.md · redteam: YES (standard tier, not yet run — queued)
  - independent validation: PASS (batch-1/independent-validation.md) — pure gate, independent dual bounds, completion-based cooldown, race guard wired, devicechange re-arm, tests+build re-run green, no scope creep
  - pre-fix live E2E repro: 5 rounds on dev_machine, pivoted to post-fix regression test (decisions/2026-07-03-t1-repro-pivot-to-postfix-regression.md) — still owed as a follow-up regression proof, not yet run against the fixed code
- B2 [pending] — Make voice audio hold up better under packet loss/jitter (codec hardening)
  - req: R2 · complexity: high · estimate: 30min · deliberation: MANDATORY
- B3 [pending] — Resume hearing each other faster after a dropped connection
  - req: R3 · complexity: high · estimate: 30min · deliberation: MANDATORY
- B4 [pending] — Show the host when someone can't be heard or is reconnecting
  - req: R4 · complexity: medium · estimate: 25min · deliberation: MANDATORY
- B5 [pending] — Auto-balance quiet and loud voices so everyone's about as easy to hear
  - req: R5 · complexity: high · estimate: 30min (may split — new WebAudio graph) · deliberation: MANDATORY
- B6 [pending] — Let room owners set a password and choose the admission rule
  - req: R6 · complexity: medium · estimate: 30min (may split — password + policy are 2 slices) · deliberation: MANDATORY
- B7 [pending] — Fix the console error on password-eye/mic/cam icon toggles in production
  - req: R7 · complexity: routine · estimate: 20min · deliberation: MANDATORY (per custom roster; light pass expected given routine tier)

Run complete when queue empty AND every req-matrix.md row VERIFIED.
