# M-B6 Decision — Operator Acceptance Baseline

## Decision

M-B6 treats Lighthouse and Playwright mobile-emulation screenshots as prepared acceptance artifacts, not replacements for the real-device smoke. JROM remains the accepting operator for iPhone Safari and Android Chrome.

## Rationale

Run 3 includes requirements that depend on browser chrome, safe-area behavior, real capture devices, and real mobile media policy. Chromium emulation can catch responsive layout regressions, but it cannot verify Safari address-bar movement, Android Chrome device behavior, or real microphone/camera continuity.

## Implementation Notes

- Lighthouse baseline runs against `https://voice.silverjrom.app/login` with mobile emulation.
- Proxy screenshots cover seven surfaces across iPhone 14, Pixel 7, and desktop viewports.
- The operator screenshot folder is intentionally empty until JROM performs the physical-device smoke.
- Lighthouse scores below target are documented but do not block this operator-prep batch by themselves.

## Consequences

- M-B6 can complete when artifacts are prepared, baseline commands are run, callback files are updated, and the branch is committed.
- Final Run 3 acceptance still requires `/projcore` and JROM to record the real-device results.
