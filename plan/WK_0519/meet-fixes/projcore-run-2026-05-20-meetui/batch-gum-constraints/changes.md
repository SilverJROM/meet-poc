# Batch GUM Constraints Changes

## User Report
NEXT BATCH — gum-constraints (DR-48), projcore v2.2. Claude /projcore supervising from lkvc-38; you are codex child lkcdx-meet-v8. Context cleared. Read the brief at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-meetui/prompts/batch-gum-constraints.md IN FULL. Small MED gap: audio getUserMedia constraints are bare true/deviceId — echoCancellation/noiseSuppression/autoGainControl left to defaults + not observable. Fix: request EC/NS/AGC=true explicitly in ALL audio acquisition paths (lobby, in-call, DR-29 switch, DR-46 recovery) alongside the existing exact deviceId — use ideal/plain-true so it never OVER-constrains (graceful if a device lacks a flag, don't throw); and LOG actual track.getSettings() (EC/NS/AGC/sampleRate/channelCount/deviceId/label) into the diagnostics (DR-35/DR-43) so /app/diagnostics shows what the mic actually applied. Scope DR-48 only; don't regress DR-29/46/13/34 or DR-1..53. v2.2: callback FIRST then prose; reply STATUS: PROPOSED with the constraint shape (EC/NS/AGC+deviceId, ideal-vs-exact), all acquisition paths, getSettings logging, planned files; WAIT for APPROVED-PLAN. DEPLOY: rebuild frontend + clean pm2 restart (verify served + no leak). Env-hygiene: pre-seed /tmp DB + isolated 48xx ports; TEST_ROOM01 stays.

APPROVED-PLAN. Correct — audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true, deviceId:{exact:selected} }, EC/NS/AGC as plain true (requested, won't over-constrain), exact deviceId preserves DR-29 (whose graceful fallback handles a vanished device); applied to all paths (lobby/in-call/DR-29/DR-46); getSettings() (EC/NS/AGC/sampleRate/channelCount/deviceId/label) logged into DR-35/DR-43 + shown in /app/diagnostics. Proceed. Don't regress DR-29/46/13/34 or DR-1..53 (a device that ignores a flag must still acquire — no throw). DEPLOY: rebuild frontend + clean pm2 restart (verify served + no leak). Env-hygiene: pre-seed /tmp DB + isolated 48xx ports; TEST_ROOM01 stays. COMMIT BEFORE STATUS: DONE, callback FIRST. Go.

## Root Cause
MediaService centralized audio acquisition through audioConstraints(), but that helper returned bare true for default microphone acquisition and only deviceId.exact for selected microphones. That left EC/NS/AGC to browser defaults and gave diagnostics no explicit record of the actual microphone processing settings applied by the browser.

## Changes
- frontend/src/app/services/media.service.ts: audioConstraints() now always requests echoCancellation=true, noiseSuppression=true, and autoGainControl=true for audio, and preserves deviceId.exact when a selected microphone is requested.
- frontend/src/app/services/meeting-sessions.service.ts: DiagnosticsTrackInfo now carries optional applied audio settings fields.
- frontend/src/app/services/webrtc.service.ts: trackInfo() reads audio track.getSettings() and includes EC/NS/AGC, sampleRate, channelCount, deviceId, and label evidence in diagnostics snapshots.
- frontend/src/app/pages/diagnostics/diagnostics.page.ts and .html: /app/diagnostics now renders applied outbound microphone settings in the latest sample and timeline peer rows.
- e2e/tests/v3-extdev/extdev.spec.ts: DR-29 external mic flow now asserts every audio getUserMedia request includes EC/NS/AGC=true and that diagnostics renders applied settings from getSettings().

## Caveats
- No autonomous product decisions.
- Existing exact deviceId fallback behavior is unchanged; EC/NS/AGC are plain boolean requests and are not used as exact constraints.
