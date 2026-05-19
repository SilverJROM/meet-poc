# Decision: v2-B5 Retry Re-Runs Preflight In Place

## Decision

The lobby Retry button calls the same preflight method again instead of reloading the page.

## Rationale

Retrying in place preserves the entered display name and room context, keeps the state machine in `lobby`, and gives B7 a clean hook for richer device-failure UX.

## Consequences

- If the user grants permission after changing browser settings, the lobby can recover without losing form state.
- No routing or backend state changes are needed for retry.
