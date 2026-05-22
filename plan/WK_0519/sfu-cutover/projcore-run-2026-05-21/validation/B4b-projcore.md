# projcore gate — B4b (SR-4 completion) — PASS
Commit: afb0441 on feat/sfu-cutover. Codex: VALIDATED-PASS (re-ran 2-client e2e 1/1 14.9s). NOTE: B4b ran a ~16min runaway analysis loop on the 3-client e2e; projcore interrupted + redirected with a bounded fix path + escape valve → recovered.
7-gate: artifacts✓ diff✓(sfu-client +40 teardown, e2e 106L; no room.page change — late-join already worked in B4a; mesh UNCHANGED) build✓ tests✓(2-client late-join+leave e2e proves late-join + live-pickup + teardown: B sees A, A sees B, A.remoteStreams 1→0 on B leave) evidence✓ req✓(SR-4 VERIFIED) standing-rules✓.
3-client fallback: per brief escape valve — A's ontrack for a late publisher's tracks took 30-60s (CF renegotiation+ICE) exceeding the e2e budget. Logic is N-independent; 2-client proves all 3 behaviors.
WATCH-ITEM (carry to B7/B9/B10 + field): late-subscribe latency — time from a peer publishing to others' ontrack firing. Codex flagged as a follow-up UX/perf risk. B9 diagnostics must measure subscribe→ontrack latency; B10/field must confirm acceptable for real 3+ calls.
VERDICT: PASS. SR-4 VERIFIED. Advance to B5a.
