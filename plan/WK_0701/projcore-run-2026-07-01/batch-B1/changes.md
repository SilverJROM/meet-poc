# Batch B1 — Changes

## User Report (verbatim)

Local/dev test path to reproduce SFU subscription failure without waiting for Cloudflare to fail live. Acceptance: (a) force `/api/sfu/tracks` 406 for a selected participant; (b) advertised-but-never-subscribed; (c) subscribed inbound audio with no progress; (d) current non-healing give-up reproduced in failing tests before any fix.

## Root Cause (mechanism — not fixed in B1)

1. **Subscribe cap → permanent stop:** `planSubscribeRetry` caps at 7; `subscribeIfNeeded` catch returns early when capped, leaving `subscribedClientIds` latched — no further subscribe until `cfSessionId` changes (`sfu-client.service.ts` ~236).
2. **Stall watchdog cap → `mark-stalled`:** `decideRemoteVoiceWatchdogAction` escalates playout recovery 4× then latches `mark-stalled` with no SFU escalation (`room-decisions.ts`).
3. **No dev fault injection:** `/api/sfu/tracks` was CF-only passthrough — 406 required live Cloudflare failure.
4. **406 evidence gap:** Subscribe HTTP failures were not captured in structured evidence separate from `lastGumError`.

## Code Changes

### `backend/src/modules/realtime-sfu/sfu-fault-inject.ts` (new)
- Env-gated JSON rule matcher + synthetic CF-shaped error responses.
- Test overrides via `setSfuFaultInjectRulesForTests` / `clearSfuFaultInjectForTests`.

### `backend/src/modules/realtime-sfu/index.ts`
- Pre-CF hook on `POST /sfu/tracks` when rules match.
- `setSfuSessionOwnerForTests` for vitest authz setup without live CF session create.

### `backend/tests/realtime-sfu.test.ts`
- B1-R1-a: matching inject → 406, `fetch` not called; non-match → passthrough.

### `frontend/src/app/services/sfu-subscribe-failure-evidence.ts` (new)
- `extractSubscribeFailureEvidence`, `remotePublisherDiagnosticsQuality`, `isLastGumErrorCandidate`.

### `frontend/src/app/services/sfu-recovery-epoch.ts` (new)
- `shouldBindSubscribeResponse` — epoch + cfSession bind contract for B2 coordinator.

### `frontend/src/app/services/sfu-client.service.ts`
- `lastSubscribeFailureEvidence` signal populated on subscribe failure (instrumentation only).

### `frontend/src/app/services/sfu-repro-harness.spec.ts` (new)
- BUG-REPRO-R1 tests with polled outcome assertions (guard latched, quality `advertised-not-subscribed`, no post-cap POST).

### `frontend/src/app/services/sfu-recovery-epoch.spec.ts` (new)
- Epoch / cfSession stale-bind contract tests.

### `frontend/src/app/pages/room/room-decisions.spec.ts`
- BUG-REPRO-R1-mark-stalled polled give-up test.