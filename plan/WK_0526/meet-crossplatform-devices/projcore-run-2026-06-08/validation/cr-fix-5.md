# CR-FIX-5 — independent validation (projcore) — 2026-06-08
VERDICT: PASS.
- B5: live mid-conflict forces renegotiating subscribe (forceRenegotiation:true, sfu-client 308/332); "capped WITHOUT permanent-stop; awaiting fresh roster" (296) → never permanent-stops/suppresses a publisher on mid-conflict.
- Observability: per-publisher blockedReason (407, remoteAudioBlockedReason) + sinkApplyResult (408) + sinkApplyTimedOut (409); advertised-publisher manifest replaces peers:[].
- Outcome tests: R2 two-concurrent-audible (spec:324-342 asserts 2 connected simultaneously) + R1 audible tuple.
- tsc=0, remote-audio/sfu-client/diagnostics specs pass, ng build exit 0.
