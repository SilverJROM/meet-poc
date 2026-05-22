# projcore gate — B4a (SR-4 part 1) — PASS
Commit: a9ab284 on feat/sfu-cutover. Codex: VALIDATED-PASS (re-ran two-client e2e, 1 passed 11.5s, inbound audio packetsReceived>0 + video framesDecoded>0 on BOTH pages).
7-gate: artifacts✓ diff✓(sfu-client +105, room.page +55, html +18, e2e 94L; mesh UNCHANGED) build✓ tests✓(2-client cross-peer e2e, real CF, re-run by codex) evidence✓(REAL bidirectional media through Cloudflare — the architectural proof) req✓(SR-4 part 1) standing-rules✓.
Key: subscribe via enqueue (full renegotiation serialized), trackName+mid→publisher mapping, ontrack→remoteStreams signal, isSfuMode tile binding. Implementer caught+fixed a race (gate subscribe on localPublishState.status==='published' so sfu-roster can't race publish).
SR-4 spans B4a+B4b → stays IN-PROGRESS until B4b (late-join/live-updates/unsubscribe).
VERDICT: PASS. Advance to B4b.
