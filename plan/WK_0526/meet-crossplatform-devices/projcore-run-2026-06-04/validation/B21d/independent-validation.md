# B21d — Independent Validation (projcore, solo): ERR6/ERR7 diagnostics

**Verdict: SOLID** — committed by projcore. Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx room-decisions.spec.ts` pass (shouldRearmLobbySelfTest cases). `npx ng build` green. DEV pm2 meet-poc-fe restarted (login 200).

## Diff review (scope clean — additive only; self-test thresholds + B16 ICE fields untouched)
- **ERR6** room.page.ts `rearmLobbySelfTestAfterAudioUnlock()` called from `unlockAudioFromGesture`; pure `shouldRearmLobbySelfTest({inLobby,audioActivated,alreadyRunning})` = inLobby && audioActivated && !alreadyRunning; dup-guarded via `!!lobbySelfTestTimer` → `startLobbySelfTest()`. A dead mic is now flagged once audio unlocks by ANY gesture. enableMicPreview unchanged. ✅
- **ERR7** room.page.ts buildDiagnosticsPayload additive fields: platform (`diagnosticsPlatform()` ios/android/mobile/desktop), userAgent, selectedAudioDeviceId, selectedVideoDeviceId, lastGumError. `lastGumError` signal set via `recordLastGumError(err)`→`diagnosticsGumError` (name+message ONLY, no stack/secrets) hooked into the EXISTING failure paths (handleInCallMediaPermission, handleLobbyMediaError, recoverLocalAudioTrack); reset to null in cleanupCall. DiagnosticsPayload type gains optional fields (additive). ✅

## Honesty
Real mobile dead-mic flag + cross-device diagnostics capture is JROM's seat; the re-arm decision is unit-proven, the payload additions are structural.
