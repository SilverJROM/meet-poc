# B21b Changes

## User Report
Projcore audited TINY2, TINY4, TINY6, and ERR9 as still open after B21a. Fix the mic watchdog stale read, local track handler leak, disabled-track false recovery, and concurrent `setSinkId` race. Do not commit.

## Root Cause
- TINY2: `pollMicSilenceWatchdog` checked mic live/enabled/unmuted before awaiting outbound stats, then used stats after the await without re-checking whether the track was still active.
- TINY4: `attachLocalTrackFailureHandlers` assigned `onended`/`onmute`/`onunmute` properties directly, with no stored refs to detach previous bindings on re-attach.
- TINY6: `handleLocalTrackFailure` gated on in-call/current-track identity but not `track.enabled`, so an intentionally disabled current track could start recovery after ending.
- ERR9: remote-audio sink application used the B13 fallback directly from multiple async paths, allowing concurrent `setSinkId` requests against the same element.

## Per-file WHY
- `frontend/src/app/pages/room/room.page.ts`: adds stored local track listener refs, detach-before-attach, cleanup detach, TINY6 recovery decision usage, debounce guard for tracks disabled during the debounce window, and TINY2 post-await mic-active re-read.
- `frontend/src/app/pages/room/room-decisions.ts`: adds the pure `decideLocalTrackFailureRecovery` helper so the TINY6 enabled/intended-off boundary is unit-testable.
- `frontend/src/app/pages/room/room-decisions.spec.ts`: proves disabled-ended ignores recovery while enabled-ended and enabled-live mute still recover.
- `frontend/src/app/services/remote-audio.service.ts`: wraps the existing B13 `applyMediaElementSinkWithDefaultFallback` in a per-element latest-wins sink applier; B13 internals remain unchanged.
- `frontend/src/app/services/remote-audio.service.spec.ts`: proves the latest-wins applier serializes per-element `setSinkId` and converges to the final sink while retaining B13 fallback tests.

## Honest proof note
- Unit-proven: TINY6 and ERR9.
- Build/reasoned: TINY2 post-await re-read and TINY4 detach-before-attach, because the relevant methods are private Angular page internals. The implementation is directly visible in diff and covered by `npx ng build`.

## Autonomous decisions
- Added the TINY6 pure helper to existing `room-decisions.ts` to avoid importing/instantiating the full Angular page in a `tsx` unit spec.
