# projcore gate — B5b (SR-5 part 2) — PASS → SR-5 VERIFIED
Commit: b61db11 (code) + d544c2a (callback chore) on feat/sfu-cutover. Codex: VALIDATED-PASS (re-ran e2e 1/1 31.1s).
7-gate: artifacts✓ diff✓(sfu-client +180, room.page +80, e2e 166L; mesh UNCHANGED) build✓ tests✓(B remoteScreenStreams 0→1 on share, →0 on stop, camera framesDecoded keeps advancing) evidence✓ req✓(SR-5 VERIFIED) standing-rules✓.
Key: screen = separate screenSender via publish-style renegotiation through enqueue (not replaceTrack); close-by-mid on stop; camera untouched; mid-call partial subscribe (subscribeNewScreenTrack) for already-subscribed peer's new screen track; ontrack routes kind=screen → remoteScreenStreams; share-layout SFU-aware.
VERDICT: PASS. SR-5 VERIFIED (B5a+B5b). Advance to B6a.
