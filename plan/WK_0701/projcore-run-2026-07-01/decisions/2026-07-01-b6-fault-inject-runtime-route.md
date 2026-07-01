# Decision — Runtime-settable fault-inject route + `matchLocation` filter (batch-B6)

**Date:** 2026-07-01
**Batch:** B6
**Status:** Approved at PROPOSED (APPROVED-PLAN), extended once during implementation

## Decision

1. Add `POST /api/sfu/test-only/fault-inject-rules` (gated `NODE_ENV !== 'production'` → 404 otherwise)
   that calls the existing `setSfuFaultInjectRulesForTests(rules)` / `clearSfuFaultInjectForTests()`
   (B1's schema, `2026-07-01-sfu-fault-inject-schema.md`) at runtime, over HTTP, against an already-running
   e2e backend process. Body: `{ rules: SfuFaultInjectRule[] | null }` (`null` clears).
2. Extended `SfuFaultInjectRule` with an optional `matchLocation?: 'local' | 'remote'`, checked against
   each track entry's `location` field in the request body. `/sfu/tracks` carries both a participant's own
   publish (`location: 'local'`) and its subscribe-to-a-peer calls (`location: 'remote'`) through the same
   endpoint; a rule scoped only by `matchParticipantId` blocks both.

## Why

- **(1)** `SFU_FAULT_INJECT_RULES` is env-only, read once at process start. The e2e webServer is one
  shared long-running process for the whole Playwright file, so per-scenario targeting (a specific
  runtime-generated `participantId`) had no mechanism — env vars can't change mid-run. Reuses the
  identical test-override primitive B1 already built; only the trigger changed from in-process Vitest
  call to HTTP.
- **(2)** Discovered live, not by inspection: a first pass targeted only `matchParticipantId` for R6a and
  the host's subscribed-track count never recovered after clearing the fault (60s timeout). Root cause:
  the SAME blanket rule was also 406-ing the host's own full-rejoin re-publish attempt (since rejoin
  re-publishes via the same `/sfu/tracks` endpoint, `location: 'local'`), so the ladder's own recovery
  path was self-defeating. `matchLocation: 'remote'` scopes the fault to the subscribe direction only,
  matching the brief's "one direction" framing.

## Scope discipline

- Both changes are additive to `sfu-fault-inject.ts`/`realtime-sfu/index.ts` test-injection plumbing only.
- No change to `sfu-client.service.ts` recovery-ladder logic, nor to the real (non-test-override)
  `SFU_FAULT_INJECT` env-var behavior for existing B1–B5 tests (verified: `realtime-sfu.test.ts` 7/7 green,
  including the pre-existing `matchTrackName`-scoped B1-R1-a test).
