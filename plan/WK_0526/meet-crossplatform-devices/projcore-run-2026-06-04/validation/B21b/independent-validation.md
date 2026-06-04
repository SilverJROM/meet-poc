# B21b — Independent Validation (projcore, solo): TINY2/TINY4/TINY6/ERR9

**Verdict: SOLID** — committed by projcore. Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx` specs pass: room-decisions, remote-audio.service, remote-audio-watchdog, remote-audio-health, media-toggle, recorder-leaks, active-speaker-leaks. ✅
- `npx ng build` green. ✅  DEV pm2 meet-poc-fe restarted. ERR9 spec asserts max-in-flight=1 + final sink = latest (speaker-c).

## Diff review (scope clean — B13 fallback wrapped not rewritten; SFU/signaling/recorder/acquisition untouched)
- **TINY2** room.page.ts pollMicSilenceWatchdog: after `await getOutboundAudioSource()`, re-reads `captureTrackLive() && captureTrackEnabled() && captureTrackUnmuted()`; if not active → reset window + indeterminate + return (no stale-read classification). ✅
- **TINY4** room.page.ts: `attachLocalTrackFailureHandler(kind, track)` does detach-before-attach then `addEventListener` with stored refs (`localTrackFailureHandlers[kind]`); `detachLocalTrackFailureHandlers()` removeEventListener + delete; called in cleanupCall. No duplicate/stale handlers on re-attach. ✅
- **TINY6** room.page.ts: pure `decideLocalTrackFailureRecovery({inCall,currentTrack,trackEnabled,event,trackReadyState})` → `!inCall||!currentTrack||!trackEnabled` ⇒ 'ignore'; mute+live ⇒ debounce; else recover. Disabled-track-ended does NOT recover; enabled genuine failure still does. ✅
- **ERR9** remote-audio.service.ts: `LatestSinkIdApplier` (per-element WeakMap {desiredDeviceId,inFlight,rerun}) coalesces concurrent calls (one in-flight per element) and drains to the LATEST desired device; `applySinkId` routes through it; B13 `applyMediaElementSinkWithDefaultFallback` unchanged. No overlapping setSinkId; converges to latest. ✅

## Honesty
TINY6 + ERR9 unit-proven; TINY2 (re-read) + TINY4 (detach/attach) proven by code structure + ng build (class-private, partly reasoned). Real rapid-toggle / multi-peer-join churn is JROM's seat.
