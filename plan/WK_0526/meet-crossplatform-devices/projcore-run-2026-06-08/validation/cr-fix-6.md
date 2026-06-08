# CR-FIX-6 — independent validation (projcore) — 2026-06-08
VERDICT: PASS.
- UNIFIED derivation: remoteAudioBlocked aggregate = entries.some(remoteAudioBlockingReason(e)!==null) (632) → aggregate + blockedReason DERIVED FROM THE SAME function, cannot disagree.
- sink-failed only on sinkApplyTimedOut||result==='failed' (649) → default-fallback-playing NOT blocked (no false tap-to-enable).
- clear-on-success + post-await guard: applyOutputDevice isEntryCurrent guard → sinkApplyResult=latest, sinkApplyTimedOut=false, blocked=false on success.
- selectedSpeakerUnavailable reset to false at startLobbyPreflight (2175) → no cross-call leak (minor: comment says cleanupCall, impl is preflight — functionally equivalent for the join flow).
- tsc=0, specs pass, ng build exit 0.
