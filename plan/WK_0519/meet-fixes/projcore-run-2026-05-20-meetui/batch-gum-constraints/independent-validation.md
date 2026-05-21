# Batch GUM Constraints Independent Validation

## Result
PASS

## Evidence
- Constraint source: MediaService.audioConstraints() returns EC/NS/AGC=true for audio and adds deviceId.exact only when a selected microphone is present.
- Path coverage: lobby preflight, lobby reacquire, selected lobby reconciliation, in-call replaceAudioTrack(), DR-29 switch fallback, and DR-46 recovery all route through MediaService.audioConstraints().
- Diagnostics: WebRTC trackInfo() reads audio track.getSettings() and includes EC/NS/AGC, sampleRate, channelCount, deviceId, and label-derived evidence in outboundAudio.
- UI: /app/diagnostics renders applied microphone settings in latest diagnostics and peer timeline rows.
- Tests: frontend build passed; targeted external-device E2E passed on isolated /tmp DB and 48xx ports; deployed pm2 services were restarted and served diagnostics with no env leak.

## Residual Risk
Browsers may omit unsupported settings from getSettings(); the UI reports those as n/a and acquisition remains non-fatal because EC/NS/AGC are plain true requests.
