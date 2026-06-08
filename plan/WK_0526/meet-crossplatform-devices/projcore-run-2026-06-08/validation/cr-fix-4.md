# CR-FIX-4 — independent validation (projcore) — 2026-06-08
VERDICT: PASS.
- ended-track: currentAudioTrack returns null if all ended (616); addPublisher guards track.readyState==='ended' (430).
- unsupported-sink: SinkApplyResult+'unsupported' (25); !setSinkId&&deviceId→'unsupported' (136); usedFallback incl unsupported (537,636).
- negative-stat reject: sampleUsable bytes>=0 && emitted>=0 (641); level/energy >=0 (111,115).
- autoplay error-class: NotSupportedError→'unsupported', AbortError→'aborted' (646-647); playbackFailure field (11).
- stale device reconcile in refreshDevices (per plan). tsc=0, specs pass, ng build exit 0.
