# M-B6 Scenarios Implemented

## Operator-Assisted Requirements

- R6.5 — Prepared real-device address-bar/safe-area checklist. Operator validation pending.
- R7.1 — Prepared iPhone Safari plus Android Chrome simultaneous smoke checklist. Operator validation pending.
- R7.2 — Added Lighthouse mobile script and captured baseline report.
- R7.3 — Prepared real two-device, two-minute call checklist. Operator validation pending.
- R7.4 — Captured Playwright mobile-emulation proxy screenshots at the live URL.
- R7.5 — Prepared final signoff handoff and real-device screenshot folder. Operator validation pending.

## Scenario Mapping

- S7.1 — Covered by `OPERATOR_SMOKE.md` steps 1-15; pending physical-device execution by JROM.
- S7.2 — Covered by `scripts/lighthouse-mobile.sh` and `batch-6/lighthouse/lighthouse-mobile-baseline.{json,html}`.
- S7.3 — Covered by `OPERATOR_SMOKE.md` steps 10-15; pending physical-device execution by JROM.
- S7.4 — Covered by 21 proxy screenshots under `batch-6/screenshots/`.
- S7.5 — Covered by `OPERATOR_HANDOFF.md`; pending JROM final acceptance.

## Proxy Screenshot Set

Viewports:
- iPhone 14 portrait: 390x844.
- Pixel 7 portrait: 412x915.
- Desktop: 1920x1080.

Surfaces:
- `/login`
- `/app/rooms`
- `/app/ongoing`
- `/app/recordings`
- `/room/<TEST_ROOM01>` lobby
- `/room/<TEST_ROOM01>` lobby after mic-preview pill tap attempt
- `/room/<TEST_ROOM01>` in-call single-peer
