# Decision — B4 Room-Full and Peer-Warning Seeding

## Status

Accepted

## Decision

Use real ephemeral `ws` clients in Playwright fixtures to seed admitted peers for S4.7 and S4.8.

## Rationale

The backend signaling protocol is already locked and tested. Real WS clients exercise the actual room cap and peer-joined behavior without adding test-only hooks to Angular components or modifying backend code.

## Consequences

- `e2e` now declares `ws` and `@types/ws`.
- S4.7 and S4.8 stay targeted and avoid full browser context fan-out for all seeded peers.
