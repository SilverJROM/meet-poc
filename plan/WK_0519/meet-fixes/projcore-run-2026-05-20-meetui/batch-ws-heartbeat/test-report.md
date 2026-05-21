# ws-heartbeat Test Report

## Commands

- `npm test -w backend -- tests/signaling-reconnect.test.ts -t heartbeat-stale` PASS
- `npm test -w backend` PASS: 130 passed, 1 skipped
- `npm run build` PASS

## Evidence

- Heartbeat-stale test logs server stale termination after two missed pongs.
- Owner receives `peer-reconnecting`, proving the stale termination went through the drop/reconnect-grace path.
- Reconnected guest resumes by `clientKey` with the same `participantId`, proving no re-admit or leave revocation occurred.

