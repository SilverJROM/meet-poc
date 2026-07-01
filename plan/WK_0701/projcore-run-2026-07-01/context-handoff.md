## Accepted: Batch-B2a — STATUS: PASS (commit e33a98d)
Branch: fix/sfu-selfheal-20260701
Implemented: recovery coordinator {epoch,publisher} + epoch guard (resetOpQueue generation) + rungs 1-2
(retry cap3 250/500/1000, renegotiate cap2 500/1000) + unconditional low-freq 30s continuation. Closed the
never-give-up class across ALL subscribe paths (primary, mid-call, live-mid-conflict fallback + its cap).
Emits needs-rejoin (+throttled) via lastRecoveryEvent signal for B2b. 3 send-backs, all converged.
Req#s: R2 PARTIAL (same-session escalation done). R2 stays IN-PROGRESS until B2b (rung-3 rejoin).
Open in matrix: R2(B2b), R3(B3), R4(B4), R5(B5), R6(B6-B9).
Gotchas:
- Frontend node:assert specs run via `npx tsx <spec>` — WRAP IN `timeout 25` (the low-freq loop uses real
  30s timers; any test hitting the recovery path without cleanup/fake-timers hangs forever).
- sfu-recovery-coordinator.spec.ts is the fake-timer harness for recovery tests — add new recovery tests there.
- Transport-recovery cap (sfu-client.service.ts ~L805 handleTransportStateChange 'capped') is R4/B4 (publish/PC), NOT R2 — leave for B4.
- needs-rejoin / throttled emitted on lastRecoveryEvent; canRunSubscribeRecovery() is the recovery gate.

## Ready for Batch-B2b (rung-3 full rejoin + rung-4 UI) — [REDTEAM:elite]
Consensus rejoin spec: deliberation/B0-recovery-ladder/consensus.md §Full SFU Rejoin Mechanism (8 steps).
Full local SFU transport/session rotation (NOT leaving app room): coalesce all pending needs-rejoin into ONE
rejoin; throttle ≤1/15s, ≤2/2min, then 60s low-freq; reuse existing MediaService tracks (no re-getUserMedia);
epoch guard already in place (resetOpQueue bumps it); announce fresh sfu-publish; subscribeAllAdvertisedRemotes.
Rung-4: visible unrecovered UI + per-rung diagnostics. Consume needs-rejoin from B2a. Routing: Sonnet.
