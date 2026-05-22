# projcore gate — B6a (SR-6 part 1) — PASS
Commit: 5524097. Codex: VALIDATED-PASS (ran simulcast e2e + B4a regression).
7-gate: artifacts✓ diff✓(sfu-client +14, e2e 110L; mesh UNCHANGED) build✓ tests✓(sender.getParameters().encodings has rids h/m/l; outbound-rtp≥1; 2-client video flows; B4a regression PASS) evidence✓(configured-encodings proof sufficient for publisher-side; multi-layer activation deferred to B10/field — only 1 layer active in headless is expected) req✓(SR-6 p1) standing-rules✓.
Key: VIDEO_SIMULCAST_ENCODINGS h(scale1,1.2M)/m(scale2,400k)/l(scale4,120k) in both doPublish addTransceiver paths; screenshare single-encoding unchanged; getVideoEncodings() debug hook.
SR-6 spans B6a+B6b → IN-PROGRESS until B6b.
VERDICT: PASS. Advance to B6b.
