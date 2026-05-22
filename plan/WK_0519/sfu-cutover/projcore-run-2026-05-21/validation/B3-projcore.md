# projcore gate — B3 (SR-3) — PASS
Commit: 66ab520 on feat/sfu-cutover. Codex: VALIDATED-PASS (validation-B3-codex.md). (Note: my Escape accidentally interrupted the implementer mid-build; it resumed cleanly and finished correctly.)
7-gate: artifacts✓ diff✓(signaling +59, ws.service +7, sfu-client +18, room.page +19, backend test 245L, frontend unit spec 80L; mesh UNCHANGED) build✓(be+fe) tests✓(backend 3/3 presence integration + frontend unit 8/8 stale-rejection + codex extra regression admit/chat/media-state 3 files/8 pass) evidence✓(roster delivery + revision monotonic + peer-left cleanup proven; stale-rejection pure-function tested) req✓(SR-3 VERIFIED) standing-rules✓.
Key: each client now announces its CF cfSessionId+trackNames via ws; server broadcasts sfu-presence (monotonic revision) + full sfu-roster on join; frontend remotePublishers signal with stale-rejection. B4 subscribes from this roster.
VERDICT: PASS. SR-3 VERIFIED. Advance to B4a.
