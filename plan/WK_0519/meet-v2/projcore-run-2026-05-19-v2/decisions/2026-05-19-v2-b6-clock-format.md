# Decision: B6 Meeting Clock Format

## Context

B6 requires an elapsed meeting clock in the call UI. There is no server-side meeting timer contract in this batch.

## Decision

Start the client-side clock when the local client is admitted to the call. Format as:

- `m:ss` under one hour
- `h:mm:ss` at one hour or more

## Rationale

This is the smallest B6-scoped implementation and matches the visible elapsed-time need without introducing synchronization or session timestamp dependencies.

## Consequences

Two participants who join at different times may see different elapsed values until a future batch chooses to use backend session start time.
