# Diagnosis evidence — cross-platform camera/mic failure (2026-06-04 Manila)

## JROM report
macbook↔iphone (same LAN, diff from server) works, "almost ever since". Issues on OTHER devices: Android, PC with external mic/cam. Called again, joined without allowing cam, unable to open camera in-call ("the previous fix didnt work"). Asked to review the problem; codex 5.5 to help.

## CONFIRMED root cause (code + web)
`frontend/src/app/services/media.service.ts videoConstraints()` and `mic-energy.ts audioCaptureConstraints()` both build `deviceId: { exact: <id> }` when a device is selected/persisted, with NO fallback. `exact` is a MANDATORY constraint — getUserMedia throws `OverconstrainedError` (or NotFoundError) if that exact deviceId is not present on the CURRENT device.
- macbook: persisted videoDeviceId/audioDeviceId match the device → works.
- Android / PC-with-external-cam-mic / any device different from where the id was saved → exact mismatch → throws → camera/mic never opens. No catch/retry-without-exact anywhere in media.service.ts.
- In-call camera enable: toggleCamera → videoConstraints(true,{videoDeviceId: selectedVideoDeviceIdForRequest()}) → {exact} → OverconstrainedError on non-matching device → "Camera access failed". Mac works, others don't. Matches JROM's report exactly.

## Why prior fixes/e2e missed it
Fake-media (--use-fake-device-for-media-stream) accepts ANY deviceId constraint, so OverconstrainedError NEVER occurs headless → the e2e passed while real devices failed. Second time fake-media masked a real failure (after #121673). LESSON: fake-media e2e is NOT proof of real-device acquisition; real-device = JROM seat.

## Diagnostics gap
meeting_session_diagnostics payload has NO platform/userAgent/device field → cannot distinguish device types or see getUserMedia error names from the DB. Recent failing calls (651a4f05/0acfac3a/8bc816a5, host jrom@silverjrom.app) have 0 diagnostic rows. The macbook call (01ec650a) shows video publishing fine. So the DB can't currently diagnose the cross-platform failures → add platform/device/error capture.

## Web sources
Chromium 614716 + 370332086 (getUserMedia deviceId exact failures), MDN getUserMedia OverconstrainedError (exact mandatory), MDN replaceTrack (codec/resolution bounds — secondary, for the publish path).

## Secondary to check (codex)
replaceTrack on a mid-call-acquired video track: codec/resolution outside negotiated bounds, or video transceiver not pre-negotiated on some browsers → local preview ok but remote sees nothing. Confirm/address if found.
