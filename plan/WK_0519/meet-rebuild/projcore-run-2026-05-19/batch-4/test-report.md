# Batch 4 Test Report

## Commands

| Command | Result |
|---|---|
| `npm run build` | PASS |
| `npm test -w backend` | PASS — 12 files / 19 tests |
| `npm test -w e2e -- tests/b3-shell-auth` | PASS — 8 tests |
| `npm test -w e2e -- tests/b4-call-ui` | PASS — 8 tests |

## Notes

- A parallel B3 regression attempt failed only because the B4 Playwright server already owned port `4710` (`EADDRINUSE`). B3 was rerun serially and passed.
- B4 targeted Playwright was rerun after tightening S4.3 to require `connected` on both browser contexts.

## Screenshot Evidence

- `screenshots/lobby-knocking-state.png`
- `screenshots/call-view-one-peer.png`
- `screenshots/call-view-two-peers.png`
- `screenshots/owner-waiting-room.png`
