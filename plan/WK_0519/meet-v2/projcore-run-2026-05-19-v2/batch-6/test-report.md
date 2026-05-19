# v2-B6 Test Report

## Commands

- `npm test -w backend -- signaling-auto-admit.test.ts signaling-knock-admit.test.ts signaling-wire-format.test.ts signaling-media-state.test.ts`
  - PASS: 4 files, 5 tests.
- `npm test -w e2e -- tests/v2-b6-grid --config=playwright.live.config.ts`
  - PASS: 7 tests, 10.1s before restart.
- `npm test -w backend`
  - PASS: 17 files, 43 tests.
- `npm run build`
  - PASS: backend TypeScript build + Angular production build.
- `pm2 restart meet-poc-be`
  - PASS: backend process online.
- `pm2 restart meet-poc-fe`
  - PASS: frontend/proxy process online.
- `npm test -w e2e -- tests/v2-b6-grid --config=playwright.live.config.ts`
  - PASS after restart: 7 tests, 9.9s.
- Public live screenshot via Playwright script against `https://voice.silverjrom.app`
  - PASS: created temp room, joined call, captured `screenshots/jrom-comparison-live-call.png`, deleted temp room through API.
- `npm test -w e2e -- tests/v2-b5-lobby --config=playwright.live.config.ts`
  - PASS: 6 tests, 2.0s.
- `npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs --config=playwright.live.config.ts`
  - PASS: 13 tests, 11.8s.

## Targeted Coverage

| Spec | Coverage |
|---|---|
| `backend/tests/signaling-media-state.test.ts` | `media-state` broadcasts to other admitted peers and does not echo to sender |
| `grid-layout.spec.ts` | 1-peer cap/centering, 2-peer split, 3-peer 2-column, 5-peer 3-column |
| `overlays-clock.spec.ts` | HOST badge, mute icon relay, camera-off avatar, elapsed clock |

## Screenshots

- `screenshots/grid-1-peer-centered.png`
- `screenshots/grid-2-peer-split.png`
- `screenshots/grid-3-peer-2x2.png`
- `screenshots/grid-5-peer-3x3.png`
- `screenshots/host-badge.png`
- `screenshots/mute-icon-visible.png`
- `screenshots/camera-off-avatar.png`
- `screenshots/clock-0-05.png`
- `screenshots/jrom-comparison-live-call.png`

## Hygiene

- B6 local test rooms with `B6GRID%` prefix were removed after validation.
- The public screenshot room was deleted through `DELETE /api/rooms/:id`.
- No B6 test recordings were created.
