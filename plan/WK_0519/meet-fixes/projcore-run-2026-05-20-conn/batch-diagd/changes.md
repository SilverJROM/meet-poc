# DIAGD Changes

## Scope
- Branch: `fix/meet-conn-diag`
- Requirements: DR-12 and DR-13

## Files Changed
- `frontend/src/app/pages/room/room.page.html`
- `frontend/src/app/pages/room/room.page.scss`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/webrtc.service.ts`
- `e2e/tests/v3-diagd-join-audio-invariant/diagd-join-audio-invariant.spec.ts`

## What Changed
- Removed the blocking lobby grey-out path so Join remains clickable except while connecting.
- Added a signal-driven Join requirements popout with exact missing-name/mic messages plus button and Escape dismissal.
- Added `missingJoinPrereqs()` and live-track mic access validation; muted join remains valid.
- Reasserted audio-first sender parameters after local sender replacement, video policy changes, and video active toggles.
- Reused tracked video senders after `replaceTrack(null)` so camera re-enable does not create a duplicate sender.
- Added DIAGD E2E coverage for the join popout, mic-denied camera-on case, muted join, and the DR-13 invariant.

## Self-Verification
- `npm run build -w frontend`: PASS
- `npm run build -w backend`: PASS
- `npm test -w backend`: PASS, 103 passed / 1 skipped
- DIAGD focused E2E on clean `/tmp/meet-diagd.sqlite`: PASS, 5/5
- Clean-db Run-1 + diag1 + diagb1 + diagb2 + diagc + diagd E2E on `/tmp/meet-diagd-full.sqlite`: PASS, 83/83

## Reproduction Notes
- Before: blocking setup state could make Join unclickable instead of explaining exact missing prerequisites.
- After: clicking Join surfaces the exact missing prerequisite popout while preserving muted join and camera-optional behavior.

## Caveats
- The browser may ignore RTP sender priority fields; the code guards best-effort `setParameters()` and keeps the invariant asserted when support exists.
