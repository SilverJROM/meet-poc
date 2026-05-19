# FIX-B1 Scenarios Implemented

## FIX-B1.1 — Offer-Before-Peer-Joined Race

- Test: `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
- Forces host `peer-joined` handling to lag behind the guest offer.
- Asserts both contexts reach connected peer connections.
- Asserts remote video elements carry audio and video tracks.

## FIX-B1.2 — Recording Includes Remote Audio Source

- Test: `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
- Joins host and guest, confirms remote audio exists, starts host recording, and asserts the recorder mix graph has at least two sources.
- Stops recording, verifies upload, verifies saved file is greater than 5 KB, and verifies ffprobe sees an audio stream.

## FIX-B1.3 — Controls Contrast

- Test: `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
- Captures `screenshots/controls-light.png`.
- Asserts control button and controls bar backgrounds differ by at least 8 RGB points.
- Asserts control button border is not the broken `rgb(216, 221, 230)` light border.

## FIX-B1.4 — Background Pause UA Gate

- Test: `e2e/tests/v3-fixb1-race/race-and-controls.spec.ts`
- Narrow desktop UA at 800x600: hidden visibility event does not pause camera.
- Mobile UA at 390x844: hidden visibility event pauses camera as intended.
