# Batch Admit Review

## Scope Review
- PASS: changes are limited to DR-38/DR-39 admit/leave policy, frontend leave/drop signaling, and focused tests.
- PASS: no DR-37 identity plumbing rewrite; the new `revoked` flag is policy state layered on the existing room-lifetime map.
- PASS: no changes to stability recovery DR-40, diagnostics DR-41/43, or video DR-42.

## Risk Review
- Close-code regression: covered by backend test proving `close(4001, 'explicit leave')` without a `leave` message is treated as a drop.
- Re-admit loop risk: covered by backend and e2e paths proving owner re-admit clears revoke, then a later drop resumes.
- Page lifecycle risk: covered by e2e reload path proving reload keeps a reconnecting card and rejoins without host admit.
- Audio/reconnect regression: existing DR-31 and DR-34 e2e specs passed after the change.

## Result
- PASS. No known functional gaps.
