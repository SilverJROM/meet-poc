# Batch video-weak Test Report

## Build

PASS: `npm run build -w frontend`

## Targeted E2E

PASS: `/tmp` DB, isolated 48xx ports

Command:
```bash
MEET_DB_PATH=/tmp/meet-poc-video-weak.sqlite \
MEET_RECORDINGS_DIR=/tmp/meet-poc-video-weak-recordings \
E2E_BASE_URL=http://localhost:4810 \
E2E_BACKEND_PORT=4820 \
E2E_FRONTEND_PORT=4811 \
E2E_PROXY_PORT=4810 \
npm test -w e2e -- \
  tests/v3-diagc-weak-connection/diagc-weak-connection.spec.ts \
  tests/v3-diagd-join-audio-invariant/diagd-join-audio-invariant.spec.ts
```

Result: 6 passed.

Coverage:
- DR-42 poor samples degrade remote video instead of pausing it.
- Degraded encoding asserted at `maxBitrate=120000`, `scaleResolutionDownBy=4`, `maxFramerate=8`.
- Receiver tile still renders remote video at degraded tier.
- Critical floor samples enter audio-only auto-poor.
- Recovery restores `maxBitrate=700000`, `scaleResolutionDownBy=1`, `maxFramerate=30`.
- Manual audio-only still pauses immediately and remains authoritative.
- DR-13 audio sender priority/networkPriority remain high.

## Deploy Verification

PASS:
- `pm2 restart ecosystem.config.js --only meet-poc-fe --update-env`
- `curl -fsS http://localhost:4700/login` served the rebuilt frontend bundle (`main-INALASI2.js`).
- `pm2 jlist` check showed `meet-poc-be` and `meet-poc-fe` online with no `MEET_DB_PATH` or `MEET_RECORDINGS_DIR` in their environments.

Screenshots:
- `screenshots/degraded-video-still-rendered.png`
- `screenshots/audio-only-floor-banner.png`
- `screenshots/audio-only-toggle.png`
- `screenshots/quality-pill.png`
