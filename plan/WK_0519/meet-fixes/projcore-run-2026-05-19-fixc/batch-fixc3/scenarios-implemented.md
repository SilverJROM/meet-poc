# Batch FIXC3 Scenarios Implemented

## FIXC3.1 Share Layout Reflow
- Join host plus three browser guests.
- Start fake screen share from the host.
- Assert `.call-panel.share-layout` is active.
- Assert a main share stage renders.
- Assert the right strip renders four compact participant tiles.

## FIXC3.2 Active Speaker Ordering And Pulse
- Inject a generated audio stream for a non-first participant through the existing localhost debug hook.
- Assert the active speaker moves to the first strip position.
- Assert the speaking tile carries the pulse/highlight class.

## FIXC3.3 Strip Collapse And Return To Grid
- Capture `share-strip.png` with strip visible.
- Click the strip collapse toggle.
- Assert the strip collapses and the main stage grows.
- Capture `share-collapsed.png`.
- Stop sharing and assert the normal grid returns.

## FIXC3.4 Eight-Participant Strip Scroll
- Join host plus seven socket-assisted admitted participants.
- Start fake screen share.
- Assert eight strip tiles are enumerable.
- Assert the strip list uses vertical scrolling and has scrollable overflow.

## Backend Signaling
- Assert `media-state` relays `screenOn`.
- Assert omitted `screenOn` defaults to false for legacy clients.
