## Accepted: R1-R5 ALL VERIFIED. Commits: 6643a02 e33a98d 5f4a6bf fc05c58 8b6825d f59a38f.
Branch: fix/sfu-selfheal-20260701. The complete SFU self-heal is shipped + validated:
reproduce (B1) → subscribe never-give-up + full rejoin (B2a/B2b) → stalled-audio escalation (B3) →
publish/PC recovery (B4) → diagnostics honesty (B5). All epoch-guarded, throttled, visible fallback UI.
Open: R6 (B6 local 2p+5p capstone; B7 Peer2; B8 3-way+dev_machine shutdown; B9 human-audible).

## Ready for Batch-B6 (local multi-participant capstone, R6) — [REDTEAM:standard], TEST-HEAVY, complexity high
Prove the recovery holds for 2-person AND 5-person calls under fault injection. This is the LOCAL capstone
before remote (B7/B8) and the human-audible gate (B9).
Infra available: B1 fault injection (SFU_FAULT_INJECT=1, force /api/sfu/tracks 406 per participant); Chromium
fake-media flags (project_specs §7/§14); the recovery ladder + diagnostics (layerDiagnostics, lastRecoveryEvent,
advertised-not-subscribed). Existing e2e: e2e/tests/sfu-b7-reconnect/, sfu-b2b-rejoin-ui/, sfu-b4-publish-recovery/,
sfu-b5-diagnostics-layer/. Isolated e2e ports via MEET_DB_PATH/E2E_*_PORT (§14).
Acceptance (R6 local part): (a) 2-person scenario green — inject a 406/stall, prove BOTH sides recover to
subscribed + healthy inbound audio (via diagnostics: advertised-not-subscribed clears, inbound RTP/energy
healthy); (b) 5-person scenario green — inject failures, prove recovery + coalescing (N advertised-not-subscribed
→ ONE rejoin, no storm); (c) evidence includes diagnostics rows proving subscriptions + recovery. Per §2.10a
this is the per-module capstone; full-suite is not required — targeted multi-participant scenarios.
Routing: Sonnet (complex e2e orchestration). Playwright real-timer waits are OK here (e2e, not the fake-timer
unit harness) — use Playwright's expect.poll / waitFor, and reasonable test timeouts.
