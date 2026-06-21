# R5 RED-TEAM CONSENSUS (2026-06-20 ~20:50) — majority FAIL (proof incomplete, NOT audio-broken)

Verdicts: opus FAIL · haiku FAIL · codex55 FAIL · sonnetb PASS-with-caveats → MAJORITY FAIL.

## All 4 AGREE
- 4-way SFU connectivity + media transport to the genuinely-remote agent is REAL (barrier rows trustworthy: ~20:35/20:37 host+l1+l2+agent all in room, each saw 3 expected peers with live tracks + inbound bytes, stable >=10s).
- The re-subscribe app fix is CODE-SOUND + correctly implemented (handleSfuPresence direct subscribeIfNeeded on reconnect L1108/1130; doSubscribeTracks stale-cfSession guard L1877-1885). sonnetb: fix observably exercised (handled mid-window churn).

## The gap (why FAIL) — to convert to PASS
1. AGENT RECEIVE side absent in clean window (bar-agent.json empty) → agent-hears-host/l1/l2 unproven THIS run → 9/12 not 12/12. NEED: agent emits timestamped page-alive MEAS-ALL attributing host-440 + local1-940 + local2-1100 in the SAME barriered window.
2. bytesDelta aliasing: 1100 track = 81567 (host view) vs 18124 (l1 view); shared byte values across tones → bytes not an independent pass criterion. FIX per-track mapping so each receiver's 3 deltas independently vary.
3. MEAS-ALL hygiene: emitted post-page-close + final row untimestamped (opus/codex55) → emit BEFORE page close + timestamp every MEAS-ALL.
4. Membership churn after barrier-stable (sonnetb: e612bc69 replaced by agent mid-window) — fix handled it, but log honestly / hold membership through window.
5. (opus, fidelity, beyond automated-tone scope) agent 660 = injected WAV not C930e human voice — note for JROM's final human-call acceptance, not the automated R5 gate.

## Action
- sonnet: fix bytesDelta per-track aliasing + emit/flush MEAS-ALL before page-close with timestamp.
- grok: orchestrate ONE coherent window where ALL 4 (incl AGENT receive-side via Peer2-codex NATIVE measure, no file push) emit timestamped page-alive MEAS-ALL, membership stable through window.
- Then re-red-team. R5 stays IN-PROGRESS until 12/12 clean-window + panel majority PASS.
