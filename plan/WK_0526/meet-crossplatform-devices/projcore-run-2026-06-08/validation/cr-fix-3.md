# CR-FIX-3 — independent validation (projcore) — 2026-06-08
VERDICT: PASS.
- HIGH selected-sink honesty: SinkApplyResult 'selected'|'default-fallback'|'failed' (remote-audio.service.ts:24,133-154); selectedSpeakerUnavailable signal (room.page.ts:223) DISTINCT from remoteAudioBlocked; "Selected speaker is unavailable. Using the system default speaker." surfaced (677/1020/1027/2625); selectedAudioOutputId kept (re-applies on devicechange).
- MED leak: subscribeMidConflictWarnings.clear() in clearLocalTransportSessionState(428)/closeLiveTracksForExit(1485)/destroy(1523).
- MINOR: watchdog keeps voiceStalled latched on recovery-exhaustion.
- tsc=0, remote-audio/sfu-client/diagnostics specs pass, ng build exit 0.
