# B21c — Independent Validation (3-agent): recorder tail REC4/REC5/REC6/REC8

**Verdict: SOLID** (projcore + independent 2nd validator both SOLID). Committed by projcore (3-agent). Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx` specs pass: recorder-leaks, room-recording, active-speaker-leaks. ✅  `npx ng build` green. ✅  DEV pm2 meet-poc-fe restarted.

## Diff review (scope clean — B18 REC1/2/3 + B17 LEAK2 intact; SFU/signaling/acquisition untouched)
- **REC4** room.page.ts ~1339: `withTimeout(recorder.stop(), 8000, null)` → on null (timeout) `discard()` + status + return (UI un-stuck); upload also withTimeout → status + return. ✅
- **REC5** recorder.service.ts: `stopInFlight`/`finalized`/`pendingStopResolve` (reset in start). stop() onstop guards `if(finalized)return` → createRecordingBlob + finalizeRecording; recorder.stop() try/catch resets flags + rethrows. discard() calls recorder.stop() ONLY when `state==='recording' && !stopInFlight` (onstop→noop first) then finalizeRecording(empty,{resetMetadata}). `finalizeRecording` runs cleanupAudioGraph + isRecording.set(false) exactly once (finalized guard) + always resolves pendingStopResolve. ✅
- **REC6** addStream zero-audio → `console.warn('recording stream skipped: no audio tracks',{clientId})`; skip unchanged. ✅
- **REC8** `resolveRecordingMime(actual,fallbackMime,fallbackExt)` + `extensionForMime` (webm/ogg/mp4/aac); `updateRecordingMime(recorder.mimeType)` in start + createRecordingBlob; upload re-resolves from blob.type → Content-Type + X-Ext. Actual negotiated mime drives all output labeling. ✅

## Independent 2nd validator (sonnet, adversarial) — SOLID
Traced all 4 interleavings (normal stop / stop-timeout-then-discard / discard-then-late-onstop / discard-while-stop-in-flight): cleanup runs EXACTLY once each, no double recorder.stop(), pendingStopResolve always resolved (catch path never awaited → no hang), flags reset for session 2. REC8: Firefox audio/ogg→.ogg, unknown mime falls back sensibly, upload re-resolves from blob.type. REC4 UI un-stuck (ws 'stopped' then discard; upload-timeout path correctly omits discard since isRecording already cleared). REC6 warn only on zero-audio skip. No B17 LEAK2 / B18 REC1-3 regression (removePeerStream dedup order unchanged; flags don't touch peer add/remove).

## Honesty
Real iOS stop-hang + real Firefox ogg playback/serving is JROM's device seat; the finalize-once race + mime labeling logic is unit-proven + adversarially traced.
