# FIX4 Test Report

Run timestamp: 2026-06-05T00:57:39Z

## Focused Specs

- PASS: `cd frontend && npx tsx src/app/services/sfu-client.spec.ts`
  - Added assertions passed:
    - STUN-only prior state calls `forceRefresh()` once.
    - Recovery PC uses refreshed relay-capable ICE servers.
    - Prior relay-capable state skips force refresh.
    - Refetch-still-STUN proceeds with STUN fallback and no extra `getIceServers()` loop.
- PASS: `cd frontend && npx tsx src/app/services/ice-config.spec.ts`

## Type Checks

- PASS: `cd frontend && npx tsc -p tsconfig.app.json --noEmit`
- PASS: `cd frontend && npx tsc -p tsconfig.spec.json --noEmit`

## Build

- PASS: `npm run build -w frontend`
  - Existing warnings observed:
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
- PASS: `curl -fsS http://localhost:4720/api/ice-config`
  - Redacted summary: `serverCount=4`, `hasTurn=true`.
  - URLs included STUN, `turn:...3478?transport=udp`, `turn:...3478?transport=tcp`, `turns:...5349?transport=tcp`, and `turns:...443?transport=tcp`.

## Not Run

- Real PH-US restrictive-link media recovery was not run from this environment. The deterministic proof is the focused unit coverage of the recovery PC ICE source.
