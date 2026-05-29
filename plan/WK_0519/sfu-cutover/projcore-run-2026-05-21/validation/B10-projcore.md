# projcore gate — B10 (SFU-default flip) — PASS (field-test-ready)
Commit: efbdd0a (branch tip 0cc1a86 incl callback chore) on feat/sfu-cutover. Codex: VALIDATED-PASS.
PROD CHANGE: 1-line isSfuMode default flip (=== '1' → !== '0') + publish gate uses isSfuMode(). Mesh intact. Reversible. (+ ?sfu=0 added to legacy specs — test-only.)
FIELD-READINESS PROOF: codex no-param smoke — a normal join (no ?sfu) uses SFU + bidirectional media (host audio:27/video:4, guest audio:9/video:3).
REGRESSION (baseline-compared vs c92f49e/B9): NO B10-introduced regressions. 35 legacy failures + B4b + B5b all fail identically at B9 baseline → pre-existing, not B10.
CAVEAT (field test): B4b (late-join/full-roster multi-subscribe) + B5b (screenshare 2nd-track subscribe) are timing-flaky in headless+real-CF (the recurring late-subscribe-latency watch-item). Basic 2-way A↔B solid; MULTI-subscribe needs real-device confirmation on the field call.
VERDICT: PASS. SFU-default field-test-ready. Deploy = JROM-gated. B8 (mesh teardown) deferred until field-proven.
