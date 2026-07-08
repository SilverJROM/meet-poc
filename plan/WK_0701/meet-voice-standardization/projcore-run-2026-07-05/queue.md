# Queue — App Issue Closeout Continuation (2026-07-05)

Dynamic queue. One batch at a time. Business-friendly labels are used as dispatch summaries.

- B1 [verified] — Prove the faster mic self-heal fix is robust before building on it
  - req: R1 · complexity: high · estimate: 30min · redteam: standard · validation: local targeted
- B2 [verified] — Make voice audio hold up better under packet loss and jitter
  - req: R2 · complexity: high · estimate: 30min · deliberation: mandatory
- B3 [verified] — Resume hearing each other faster after a dropped connection
  - req: R3 · complexity: high · estimate: 30min · deliberation: mandatory
- B4 [verified] — Show the host when someone cannot be heard or is reconnecting
  - req: R4 · complexity: medium · estimate: 25min · deliberation: mandatory
- B5 [verified] — Auto-balance quiet and loud voices so everyone is easier to hear
  - req: R5 · complexity: high · estimate: 30min · may split · deliberation: mandatory
- B6 [verified] — Let room owners set a password and choose the admission rule
  - req: R6 · complexity: high · estimate: 30min · likely split · deliberation: mandatory · escalation guard: RBAC/auth boundary
- B7 [verified] — Fix console errors on dynamic icon toggles in production builds
  - req: R7 · complexity: routine · estimate: 20min
- B8 [verified] — Verify transcript library grouping is running where it should be
  - req: R8 · complexity: routine · estimate: 20min · deploy guard: QA/PROD stop
- B9 [verified] — Align preflight mic/speaker prerequisite behavior with product intent
  - req: R9 · complexity: medium · estimate: 25min
- B10 [verified] — Repair stale e2e fixtures without changing product behavior
  - req: R10 · complexity: medium · estimate: 30min

Run complete when queue is empty and every req-matrix row is VERIFIED.
