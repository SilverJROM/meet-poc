# projcore gate — B5a (SR-5 part 1) — PASS
Commit: 884755c on feat/sfu-cutover. Codex: VALIDATED-PASS.
7-gate: artifacts✓ diff✓(sfu-client +33, room.page +11, e2e 134L; mesh UNCHANGED) build✓ tests✓(e2e 1/1 24s: cam-off framesDecoded stops, cam-on resumes, mic-mute → peer micEnabled:false) evidence✓(codex re-assessed: framesDecoded for cam is direct; mic via media-state propagation is meaningful; audio packetsReceived avoided — unreliable with fake media) req✓(SR-5 p1) standing-rules✓.
Key: replaceVideoTrack(track|null) on pre-negotiated sender via enqueue (no renegotiation); mic via track.enabled; sfuPeers reads mic/cam from media-state peer model.
SR-5 spans B5a+B5b → IN-PROGRESS until B5b (screenshare).
VERDICT: PASS. Advance to B5b.
