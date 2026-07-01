# Batch B2b — Test Report

**Date:** 2026-07-01
**Branch:** `fix/sfu-selfheal-20260701`

| Command | Result |
|---------|--------|
| `cd frontend && timeout 60 npx tsc --noEmit -p tsconfig.json` | ✅ PASS (only pre-existing unrelated `room-decisions.spec.ts` errors — same 9 errors as B2a's baseline, none new) |
| `cd frontend && timeout 120 npx ng build --configuration development` | ✅ PASS, no new warnings |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | ✅ PASS, exits clean — includes the 4 new B2b test blocks (COALESCING+RESUBSCRIBE-ALL, NO-DUPLICATE-SUBSCRIBE, EPOCH-SAFETY-DURING-REJOIN, THROTTLE) alongside all pre-existing B2a tests, still green |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-repro-harness.spec.ts` | ✅ PASS, exits clean (unchanged from B2a; the new `handleNeedsRejoinTrigger()` call no-ops gracefully — logs "no republish handler registered" since these tests don't register one) |
| `cd frontend && timeout 25 npx tsx src/app/services/sfu-recovery-epoch.spec.ts` | ✅ PASS, exits clean (unchanged) |
| `cd e2e && E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4821 E2E_PROXY_PORT=4830 E2E_BASE_URL=http://localhost:4830 E2E_WS_ORIGIN=ws://localhost:4830 MEET_DB_PATH=<isolated> MEET_RECORDINGS_DIR=<isolated> timeout 180 npx playwright test tests/sfu-b2b-rejoin-ui/` | ✅ PASS (1/1) — rung-4 banner + Retry button render, screenshot captured, Retry click does not crash the call |

## Isolated E2E ports — why, and cleanup

The default e2e ports (4720 backend / 4711 frontend / 4710 proxy per `playwright.config.ts`) collided
with a live PM2/tsx-watch backend already listening on `:4720` in this shared dev environment (confirmed
via `lsof`/`ps` — NOT something this batch started; it predates this session). Per
`project_specs.md`'s own documented escape hatch ("Isolated E2E ports: set `MEET_DB_PATH`,
`MEET_RECORDINGS_DIR`, `E2E_BACKEND_PORT`, `E2E_FRONTEND_PORT`, `E2E_PROXY_PORT`, `E2E_BASE_URL`, and
`E2E_WS_ORIGIN` together to avoid hitting live PM2 state"), the run used alternate ports
(4820/4821/4830) and an isolated scratch SQLite DB + recordings dir — **never touched the live PM2
backend or its database.** The isolated DB/recordings files and the test room (`SFUB2BREJOIN` prefix,
via the same `cleanupRoomsByPrefix` pattern as B9's e2e suite) were deleted after the run; verified via
`ss -ltn` that ports 4820/4821/4830 are clear and `ps`/`lsof` confirm the pre-existing PM2 backend on
`:4720` was never disturbed.

## Outcome assertions (not just call-fired counters)

| Test | Outcome asserted |
|------|-------------------|
| `COALESCING` | Two publishers exhausting rung-2 in the same synchronous tick cause exactly 1 `transportRecoveryHandler` invocation (not 2), and the coalescing lock (`rejoinScheduled`) releases once the rejoin completes |
| `RESUBSCRIBE-ALL` (same test) | Both `bob-audio` and `alice-audio` POST — the bystander publisher comes back too, not just the trigger |
| `NO-DUPLICATE-SUBSCRIBE` | A publisher already claimed by a racing subscribe path produces exactly 0 extra POSTs for it — only the non-raced publisher is subscribed by the rejoin |
| `EPOCH-SAFETY-DURING-REJOIN` | A rejoin whose republish resolves AFTER `recoveryEpoch` was bumped by an unrelated concurrent reset results in 0 subscribe calls — the stale rejoin correctly no-ops rather than binding onto a superseded epoch |
| `THROTTLE` | Walks 5 simulated timestamps (0s/5s/25s/45s/225s via overridden `nowMs()`) proving: 1st proceeds, 2nd blocked inside 15s (`unrecovered-visible` + `sfuRejoinThrottled=true`), 2nd real one proceeds past 15s (`sfuRejoinThrottled` clears), 3rd blocked by the ≤2/2min cap while still inside the 2min window, and a rejoin past the 2min window proceeds again — never a permanent stop |
| B2b e2e screenshot | `.sfu-rejoin-unrecovered-notice` is absent before forcing the state, visible with an actionable "Retry" button after, and clicking Retry does not crash the call (`.call-panel` still visible) |

## Not run (out of scope / follow-up)

- Full `sfu-client.spec.ts` (pre-existing unrelated status, per B1/B2a's own test-report notes — not a
  required-green target for this workstream)
- A real 2-browser live rejoin-throttle-exhaustion e2e (the mechanism is proven in the fake-timed
  service-level spec; the e2e's only job is the rendered-DOM UI proof, per the brief)
- Fixing `e2e/fixtures/auth.ts`'s pre-existing `loginAsJrom()` ambiguous-locator bug (flagged in
  changes.md, worked around locally in the new spec file — out of this batch's scope)
