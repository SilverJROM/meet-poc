# FIX5 Test Report

Run timestamp: 2026-06-05T01:29:09Z

## Focused Frontend Specs

- PASS: `cd frontend && npx tsx src/app/services/sfu-client.spec.ts`
  - Proves candidate-pair bitrate/RTT/bytes capture.
  - Proves `remote-inbound-rtp.localId -> outbound.id` matching.
  - Proves `ssrc + kind` fallback matching.
  - Proves inbound audio `audioLevel`/`jitter` and video `nackCount`/`pliCount`.
  - Proves `getStats()` is called exactly once.
  - Proves missing fields become `null`.
- PASS: `cd frontend && npx tsx src/app/pages/diagnostics/diagnostics.page.spec.ts`
  - Proves RTT hint labels.
  - Proves network path rows render useful values and `n/a` for absent data.

## Backend Round Trip

- PASS: `npm test -w backend -- session-diagnostics.test.ts`
  - Proves nested new `sfuDiagnostics` fields round-trip through diagnostics POST/GET raw payload JSON.

## Type Checks

- PASS: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
- PASS: `cd frontend && npx tsc -p tsconfig.spec.json --noEmit`

## Build

- PASS: `npm run build -w frontend`
  - Existing Angular warnings observed:
    - Stencil empty glob warning.
    - `@mediapipe/selfie_segmentation` CommonJS optimization warning.

## DEV Deploy

- PASS: `pm2 restart meet-poc-fe`
  - `meet-poc-fe` restarted and reported `online`.

## DEV Smoke

- PASS: `curl -fsSI http://localhost:4700/login`
  - HTTP 200.
- PASS: `curl -fsS http://localhost:4720/health`
  - Response: `{"ok":true}`.
