# Decision — B5 Upload Authentication Tradeoff

## Status

Accepted

## Decision

Keep `POST /upload` unauthenticated while requiring auth for listing and downloads.

## Rationale

The B5 brief explicitly says the legacy upload route was unauthenticated and to keep that behavior. Room existence and admitted-call flow gate the normal UI path, while listing/downloading still enforce owner visibility.

## Consequences

- Any caller can POST bytes with an `X-Room` header, matching legacy.
- Saved files for non-owned rooms do not appear in an authenticated user's dashboard.
