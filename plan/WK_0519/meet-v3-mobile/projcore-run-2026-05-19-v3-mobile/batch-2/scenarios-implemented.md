# M-B2 Scenarios Implemented

## S5.1 — Mobile Preflight Requests 480p

At 390x844, enabling camera in the lobby records `__meetDebug.lastVideoConstraints.video.width.max === 854` and `height.max === 480`.

Evidence: `mobile-constraints.spec.ts`.

## S5.2 — Desktop Preflight Unchanged

At 1920x1080, enabling camera records the existing desktop constraint path with `width.ideal === 1280` and `height.ideal === 720`, with no `max: 854` cap.

Evidence: `desktop-constraints.spec.ts`.

## S5.3 — Mobile Cap Rejects 5th Mobile Peer

Four owner sockets join with `mobile:true`; a mobile Playwright joiner receives `mobile room full (4 max)`.

Evidence: `mobile-cap-rejection.spec.ts` and `signaling-mobile-cap.test.ts`.

## S5.4 — Background Tab Pauses Mobile Video

At 390x844, a host in-call with camera on receives a simulated `visibilitychange:hidden`; local video track disables and a second browser context observes the host peer `camEnabled` flip to `false`. On `visible`, the track and peer state restore.

Evidence: `background-tab.spec.ts`.

## S5.5 — Desktop Visibility Unchanged

At 1920x1080, simulated `visibilitychange:hidden` leaves local video enabled.

Evidence: `background-tab-desktop.spec.ts`.

## Global Cap Edge

Backend vitest verifies 4 mobile + 3 desktop lets one more desktop in, then rejects the 9th total peer with `room full (max 8)`.

Evidence: `signaling-mobile-cap.test.ts`.
