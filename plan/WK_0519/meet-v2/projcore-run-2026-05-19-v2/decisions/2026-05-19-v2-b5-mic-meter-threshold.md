# Decision: v2-B5 Mic Meter Threshold

## Decision

Use eight bars where bar `N` is active when normalized RMS is greater than `N / 8`.

## Rationale

The threshold is simple, stable, and maps directly to the eight visual bars required by R5.2. The service multiplies the raw RMS by 3 before clamping to make browser fake-media input visible without making the component depend on test-specific logic.

## Consequences

- The meter updates at 8 Hz.
- Low-level input activates the first bars; louder input activates more bars.
- The Playwright assertion can check `.bar.is-active` without reading canvas/audio internals.
