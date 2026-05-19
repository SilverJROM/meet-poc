# FIX-B1 Changes

## User Report

JROM reported:

- "the video of the attendee is not showing on my admin view, and the admin camera is not showing on the attendees view"
- "i dont see the commands to mute/disable camera, etc with the changed color coding"
- "check the voice and recording logic, voice as i was not able to test this due to the problematic UI"

## Root Causes

1. Signaling race: `RoomPage` previously passed inbound `signal` messages directly to `WebrtcService`. If a signal arrived before `peer-joined` created the peer PC, `WebrtcService.handleSignal()` returned early and the offer/ICE was lost.
2. Background-tab pause gate: mobile video pause used viewport width only, so a narrow desktop browser could be treated as mobile.
3. Controls contrast: the light theme made normal control buttons white on a white controls bar with only a faint `#d8dde6` border.

## Code Changes

- `frontend/src/app/pages/room/room.page.ts`
  - Added `pendingSignals` buffer keyed by sender id.
  - Buffers up to 20 early SDP/ICE messages per sender and logs buffer/drain events.
  - Drains queued signals immediately after the peer PC is created.
  - Clears queued signals on peer leave and call cleanup.
  - Tightened background pause to `viewport.isMobile() && platform.isMobileUA()`.
  - Added debug hooks for peer connection states, remote media, and recorder source count.

- `frontend/src/app/services/recorder.service.ts`
  - Added `sourceCount` signal so tests can confirm local plus remote audio sources are attached to the recording mix graph.

- `frontend/src/app/components/controls-bar/controls-bar.component.scss`
  - Normal controls now use `var(--panel-soft)`, a stronger light-theme border, and a subtle shadow.
  - Hover state keeps the blue accent and slight lift.
  - Off/recording/leave semantic red states remain unchanged.

- `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
  - Added four FIX-B1 tests for race buffering, recording remote audio source capture, controls contrast, and UA-gated background pause.

## Deploy

- Built backend and frontend.
- Restarted `meet-poc-fe`.
- Live `https://voice.silverjrom.app/` and `/room/3f324d8be763` return the refreshed Angular bundle.
