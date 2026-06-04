# B21a — Independent Validation (projcore, solo): A8/A9/A12/TINY3

**Verdict: SOLID** — committed by projcore. Verifier ≠ fixer.

## Pre-scope (projcore audit)
Confirmed STILL OPEN before dispatch (6 siblings already-fixed were excluded). All 4 closed here.

## Proof re-run by projcore
- `npx tsx` specs pass: room-decisions, media.service, media-acquisition, media-toggle, device-selection, local-media-recovery, media-screen. ✅
- `npx ng build` green. ✅  DEV pm2 meet-poc-fe restarted.

## Diff review (scope clean — no SFU/signaling/recorder/transport/B16-20 touched)
- **A8** room.page.ts audio+video device-change: capture previousSelectedId/previousStoredId(/previousPinned), attempt acquire (replaceInCall*/reacquireLobbyStream now return boolean), on failure restore selected id + `storeDevice(storedDeviceAfterSelectionAttempt({attemptSucceeded:false,previousStoredId,acquiredDeviceId}))`. Pure `storedDeviceAfterSelectionAttempt`: success→acquired id, failure→previousStoredId (no persist-before-acquire; dead id never pinned; first-ever-failure persists nothing). Camera-off path just records preference. ✅
- **A9** room.page.ts refreshDevices: `shouldClearVideoPinAfterRefresh({selectedDeviceId, availableDeviceIds})` (selected set AND not in enumerated) → `videoDevicePinned.set(false)`. Stale exact pin cleared on missing cam. ✅
- **A12** room.page.ts toggleMic: `shouldAcquireMicTrackForToggle({trackExists, trackReadyState})` (no track OR not 'live') → `replaceInCallAudio(requestedAudioDeviceId)` (acquireAudio exact→ideal→default ladder); live-track fast path stays in media.toggleMic. media.service replaceAudioTrack now handles `!stream` (sets localStream to acquired) so the acquire-new-track case works. ✅
- **TINY3** media.service.ts pure `micOnFromTrack(track)` = `track && readyState==='live' && enabled`, used at both micOn.set sites. No false-positive from an instantly-ended track. ✅

## Honesty
Real cross-device persistence/reload + wrong-saved-id recovery is JROM's seat; the decision logic (persist/rollback/clear-pin/ladder-routing/live-guard) is unit-proven.
