# Decision — B4 Screen Share Test Strategy

## Status

Accepted

## Decision

Stub `navigator.mediaDevices.getDisplayMedia` in S4.5 with a canvas stream.

## Rationale

Playwright's fake media flags cover mic/camera, but the browser screen-picker path is not reliably automatable. The production code still calls the native API; the test validates that the UI triggers the call path and that media state remains inspectable from the page.

## Consequences

- B4 avoids brittle OS/browser permission UI coupling.
- S4.5 records the screen-share attempt count through `window.__meetDebug`.
