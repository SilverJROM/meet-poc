# Implementation Plan — App Issue Closeout Continuation

Run model: projcore, one atomic batch at a time, verifier separate from fixer.

1. Re-anchor the paused July 3 work into this July 5 continuation because the prior run was marked
   complete in overmind after being paused.
2. Preserve R1 as implemented on current branch, but run its owed red-team/regression proof before
   treating it as continuation-complete.
3. Work remaining issues in reliability-first order: R2, R3, R4, R5, R6, R7, R8, R9, R10.
4. Use mandatory per-item deliberation for non-routine design work. User-specified active roster:
   coordinator codex55, co-planner Sonnet 5, L1 implementers Spark/Grok Composer, L2 implementers
   Grok Build/Haiku, validator codex55, deliberation/red-team from the same team as needed.
5. Validate at the user-facing level. UI changes require browser proof and screenshots; WebRTC/SFU
   changes require targeted tests plus observable debug/stat evidence where possible.
6. Use dev_machine as the reproduce/fix-validation remote client and Peer2's computer as
   confirmation-only before final handback. Shut down dev_machine after the active validation window.
7. Escalate only true blockers: irreversible/data-loss risk, auth/RBAC/security boundary, paid
   resource creation, QA/PROD deploy, hardened-module touch, explicit requirement contradiction,
   or repeated non-convergence.
