# projcore gate — B7 (SR-7) — PASS (after 3 fix iterations; verifier≠fixer caught real bugs)
Final commit: aabe71c on feat/sfu-cutover. Codex final: VALIDATED-PASS (4/4 × 2 fresh-DB runs).
Iteration history (all real bugs codex caught that implementer self-tests missed):
- iter0 (0e31e58): reconnect mechanics + exit; codex FAIL — exit didn't close SFU PC + reconnect re-subscribe never fired (A.subscribedTracks=0 for 180s).
- iter1 (d2a8b0e): PC-close fixed + retry scaffold; codex FAIL — re-subscribe still 0 (retry not triggering; found stale-CF-session accumulation from destroy() clearing creds before close PUT).
- iter2 (c8b6182): ROOT CAUSE — CF returns not_found_track_error on subscribe to a freshly-republished session; old code ignored it. Detect→throw→retry. Functionally GREEN, but codex FAIL — retry was UNBOUNDED.
- iter3 (aabe71c): bounded retry (cap 7, exp backoff 250ms→4s, per-publisher counter, reset on success/new-cfSession/teardown/reconnect/destroy). PASS.
7-gate: artifacts✓ diff✓(sfu-client + room.page + e2e; mesh UNCHANGED across all iters) build✓ tests✓(4/4 × 2 fresh-DB: drop→subscribedTracks===2 no-ghost new-cfSessionId, exit→0, B4a regression) evidence✓(codex independent 2-run; root-cause documented) req✓(SR-7 VERIFIED) standing-rules✓.
SIGNIFICANCE: directly fixes JROM's original "she gets dropped on my call / restart room to resume" class — drop→seamless reconnect, no re-admit, no ghost.
VERDICT: PASS. SR-7 VERIFIED. Advance to B9.
