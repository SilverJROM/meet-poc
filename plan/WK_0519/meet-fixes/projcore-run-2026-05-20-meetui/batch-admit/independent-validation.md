# Batch Admit Independent Validation

## Requirement Mapping
- DR-39: PASS. Known non-revoked admitted `clientKey` rejoins without waiting-room after drop/reload and after reconnect grace expiry; participant identity is reused.
- DR-38: PASS. Only the explicit `leave` message revokes; the Exit button removes the card immediately and a return requires re-admit. Reload/drop keeps one Reconnecting card.
- Reinforcement 1: PASS. Server ignores close code/reason for leave policy; a bare `close(4001, 'explicit leave')` is a drop.
- Reinforcement 2: PASS. Owner re-admit clears revoke and later drops resume without re-admit.

## Evidence
- Backend focused tests: PASS, 11/11 reconnect policy.
- Browser target tests: PASS, 2/2 admit spec with screenshots.
- Browser regressions: PASS, 3/3 DR-31 reconnect + DR-34 audiofix.
- Build: PASS.
- Env hygiene: PASS.

## Verdict
PASS. DR-38 and DR-39 are implemented without observed regression in the adjacent reconnect/audio paths.
