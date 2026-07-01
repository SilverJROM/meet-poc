# Decision — SFU fault-injection rule schema (batch-B1)

**Date:** 2026-07-01  
**Batch:** B1  
**Status:** Approved at PROPOSED

## Decision

Use env-gated JSON rules (`SFU_FAULT_INJECT=1` + `SFU_FAULT_INJECT_RULES`) with per-endpoint objects:

```json
[{
  "endpoint": "tracks",
  "matchParticipantId": "p-bob",
  "matchTrackName": "bob-audio",
  "status": 406,
  "errorDescription": "session_not_found",
  "errorCode": "session_not_found"
}]
```

Injection runs only when `NODE_ENV !== 'production'`. Tests may override rules via `setSfuFaultInjectRulesForTests()`.

## Why

- Selective 406 repro without Cloudflare (R1-a).
- JSON keeps participant + track targeting explicit for multi-participant capstone (B6).
- Test override avoids mutating process env in vitest supertest flows.