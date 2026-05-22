# projcore gate — B9 (SR-9) — PASS
Commit: 920ce49 on feat/sfu-cutover. Codex: VALIDATED-PASS (e2e 2/2 + direct SQLite check: 1 row with sfuDiagnostics, peer_count=2, candidate_types=host,relay, relay_used=1).
7-gate: artifacts✓ diff✓(meeting-sessions +47, sfu-client +130, store.ts +15, diagnostics page +65, room.page +8, e2e 157L; mesh UNCHANGED) build✓ tests✓(outbound+inbound+candidate+subscribe-latency present; PERSISTED row confirmed) evidence✓(additive sfuDiagnostics, no schema change; single-PC getStats; mid→midToEntry attribution; subscribe-latency at reconciliation) req✓(SR-9 VERIFIED) standing-rules✓.
Key: projcore can now pull two-sided forensics on a real SFU call (same meeting_session_diagnostics table). Subscribe-latency metric instrumented (the B4b/B7 watch-item) for field-test confirmation.
VERDICT: PASS. SR-9 VERIFIED. Advance to B8 (retire mesh).
