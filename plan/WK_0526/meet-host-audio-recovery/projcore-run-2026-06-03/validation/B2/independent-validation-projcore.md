# B2 Independent Validation — projcore (verifier ≠ fixer)
2026-06-03 Manila. Commit bf5a1c4 (+bookkeeping fd5bab6/fc8733d) on feat/host-audio-recovery-20260603.

VERDICT: PASS. R2.1-R2.4 VERIFIED (unit+build+integration). Real-world self-heal of a live stuck call = JROM seat.

Checks I ran INDEPENDENTLY:
1. Scope: room.page.ts(+129 watchdog poller), remote-audio.service.ts(+121 decideVoiceRecovery + ladder), remote-audio-watchdog.spec.ts(new). No SFU/diagnostics-schema/B1-rewrite. CLEAN.
2. Detector (pure decideVoiceRecovery): guards present in code AND unit-tested (npx tsx remote-audio-watchdog.spec.ts PASS):
   - R2-U1 receiving+emitted-flat ⇒ resume; R2-U2 ladder resume→kickstart→replay→rebuild per attempt; R2-U3 bytes-flat (real silence) ⇒ none; R2-U4 mutedAll ⇒ none; R2-U5 emitted-climbing ⇒ none (no thrash); R2-U6 attempt-cap respected. The critical no-false-fire guards are all proven.
3. Poller: room.page watchdog timer (in-call start / cleanup stop), per-peer windows keyed by publisherClientId, reuses sfuClient.collectDiagnostics inboundTracks. Runs for host AND guests (lives in shared room.page).
4. Ladder: service methods CALL B1 (resume/kickstart/replay/rebuild) — B1 not rewritten.
5. All specs (npx tsx): remote-audio-watchdog PASS, remote-audio-playability PASS, remote-audio-health PASS, feedback-limiter PASS → no regression.
6. Build: independent ng build exit 0.
7. Live DB: zero test-room pollution from codex e2e (ran isolated). .test-rooms.json IDs are in the isolated e2e DB only.
8. b1-host-audio e2e re-run on current HEAD (B1+B2): see below (no-regression integration gate).

b1-host-audio e2e on B1+B2 HEAD (isolated 4740/41/42): 6/6 PASS — playout intact with watchdog wired in. No regression.
