# Decision: DR-37 Identity Test Follows DR-39 Drop Semantics

Date: 2026-05-21
Type: autonomous-call
Priority: medium

## Context

`e2e/tests/v3-identity/identity.spec.ts` still expected a full reload/drop to remove the host-side tile and require a fresh manual admit. DR-39 later changed the contract: explicit Exit revokes/removes, but bare drops/reloads keep one reconnecting/resumed tile and auto-admit by durable DR-37 clientKey.

## Decision

Update only the test expectation to the current DR-37 + DR-39 contract:

- The same participantId remains represented once during the drop.
- The browser reuses the same localStorage clientKey.
- Rejoin auto-resumes without a waiting-list admit.

## Reasoning

Leaving the old assertion would make the DR-37 regression test fail precisely when the newer DR-39 behavior is correct.
