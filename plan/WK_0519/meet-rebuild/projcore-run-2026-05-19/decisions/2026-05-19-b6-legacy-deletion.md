# Decision — B6 Legacy Deletion

## Status

Accepted

## Decision

Delete `legacy-poc/` entirely during B6.

## Rationale

JROM explicitly directed: "delete the old app please indiscrimintely and use this updated one on the port" and "the old app is deprecated just delete it indiscriminately no need to step on eggshells here."

## Consequences

- Legacy source is no longer present on disk.
- Legacy source remains recoverable from git history.
- `ROLLBACK.md` documents this as a historical restore path, not a supported live rollback.
