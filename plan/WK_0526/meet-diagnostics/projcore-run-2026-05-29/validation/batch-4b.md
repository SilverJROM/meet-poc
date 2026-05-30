# validation/batch-4b — projcore gate (R7 silent-remote flag)
**Verdict: PASS** · HEAD 6a96b9e. B4 (R6+R7) COMPLETE.
- Frontend-only (5 files +358/−2): remote-audio-health.ts (pure) + spec + diagnostics.page wiring.
- classifyRemoteAudioHealth verified: non-audio/null→unknown; emittedTotal<48000 (incl 0+0 div0)→unknown; ratio≥0.5→silent else ok.
- D1 ✓ concealmentRatio is SOLE verdict driver; bytes/packets DISPLAY-only (not in verdict).
- D2 ✓ sourceMicSilent HARDENER-ONLY (param unused in classify — prefixed _; only appends "· silent at source" in remoteAudioBadgeLabel). Never flips ok→silent.
- Verify-at-gate invariants ✓ badge ONLY for 'silent' (label '' otherwise); early/short→'unknown' not 'silent'.
- Build ✓ FE green. Test ✓ re-ran remote-audio-health.spec.ts passed.
- R7 → VERIFIED (rendered view = manual).
