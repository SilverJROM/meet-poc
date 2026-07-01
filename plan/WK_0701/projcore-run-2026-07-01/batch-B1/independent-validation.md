# Batch B1 — Independent Validation

Validator: codex55
Commit under validation: `6643a023b2b77879150be168fcff95d23375c81d`
Requirement: R1 SFU non-healing reproduction harness

## Verdict

Overall: **PASS / REPRO-CONFIRMED**

The harness honestly reproduces the current non-healing behavior for R1(a-d). The tests assert terminal outcomes: forced 406, advertised-but-not-subscribed, subscribed guard latched after retry cap, zero additional subscribe POSTs after cap, and mark-stalled staying latched instead of escalating to recovery.

## R1 Criteria

| Criterion | Result | Covering test | Evidence |
|---|---|---|---|
| R1(a) force `/api/sfu/tracks` 406 for selected participant | PASS | `backend/tests/realtime-sfu.test.ts` — `B1-R1-a fault inject: matching participant on POST /api/sfu/tracks returns 406 without calling Cloudflare` | Asserts matching participant + track returns `406`, `errorCode=session_not_found`, `faultInjected=true`, and `fetchSpy` is not called. |
| R1(b) advertised-but-never-subscribed | PASS | `frontend/src/app/services/sfu-repro-harness.spec.ts` — `BUG-REPRO-R1-406-subscribe-cap-give-up` and `BUG-REPRO-R1-advertised-not-subscribed-stuck-give-up` | `assertGiveUpOutcome()` asserts diagnostics quality is `advertised-not-subscribed` and no `subscribedTracks()` entry exists for the publisher after give-up. |
| R1(c) subscribed inbound audio with no usable progress | PASS | `frontend/src/app/services/sfu-repro-harness.spec.ts` — `BUG-REPRO-R1-advertised-not-subscribed-stuck-give-up`; `frontend/src/app/pages/room/room-decisions.spec.ts` — `BUG-REPRO-R1-mark-stalled-give-up` | Harness drives the stuck/no-first-frame subscribe path to retry cap; room decision test asserts repeated samples stay `mark-stalled`, do not become `recover`, and attempts remain capped. |
| R1(d) current non-healing / give-up behavior reproduced before fix | PASS | `frontend/src/app/services/sfu-repro-harness.spec.ts` shared `assertGiveUpOutcome()`; `frontend/src/app/pages/room/room-decisions.spec.ts` mark-stalled block | Asserts `subscribedClientIds` remains latched, retry attempts are `> 7`, stuck watchdog is inactive, repeated `subscribeIfNeeded()` calls make zero new POSTs, and `subscribeRetryVersion` stays stable. |

## Hidden-Fix Audit

PASS. B1 did not change `frontend/src/app/services/sfu-roster-utils.ts` (`planSubscribeRetry`) or `frontend/src/app/pages/room/room-decisions.ts` (`decideRemoteVoiceWatchdogAction`). `git diff e9aedff..6643a02 -- frontend/src/app/pages/room/room-decisions.ts frontend/src/app/services/sfu-roster-utils.ts` is empty.

`frontend/src/app/services/sfu-recovery-epoch.ts` is an inert pure predicate. It is only imported by `sfu-recovery-epoch.spec.ts`; no live subscribe path imports or calls it.

`frontend/src/app/services/sfu-client.service.ts` change is instrumentation-only: it sets `lastSubscribeFailureEvidence` in the existing subscribe failure catch path before the existing `nextSubscribeRetry()` branch. It does not alter retry cap, guard clearing, or give-up flow.

## Fault Injection Safety

PASS with note. Runtime env parsing is gated by `SFU_FAULT_INJECT=1` and returns `null` when `NODE_ENV === 'production'`. The only live hook is `/api/sfu/tracks`, after admitted/owned-session checks. Test override helpers bypass env by design and are only used from tests in this diff; no production code path calls them.

## 406 Evidence / GUM Classification

PASS. `BUG-REPRO-R1-406-evidence-not-gum-error` asserts `httpStatus=406`, `errorCode=session_not_found`, `errorDescription=session_not_found`, endpoint `POST /api/sfu/tracks`, local/remote CF session IDs, publisher IDs, track names, and PC signaling state. It also asserts `isLastGumErrorCandidate(make406Error()) === false` before and after retry-cap give-up.

## Pre-Existing Failure Sanity

Confirmed pre-existing and not caused by B1. `cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts` currently fails at line 400 because `missingPreflightPrereqs({ hasMicAccess: false, micVerified: false, speakerTested: false })` expects `['mic','speaker']` but receives `['mic']`.

At base `e9aedff`, the same expectation exists in `frontend/src/app/pages/room/room-decisions.spec.ts`, and base `frontend/src/app/pages/room/room-decisions.ts` implements `missingPreflightPrereqs` as mic-only. B1 did not touch `room-decisions.ts` production code.

The B1 mark-stalled repro block is before this failure and did not fail before the pre-existing assertion stopped the file.

## Commands Run

```bash
cd backend && npx vitest run tests/realtime-sfu.test.ts
```

PASS: 5 tests passed.

```bash
cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts
```

PASS: `sfu-repro-harness: all assertions passed`.

```bash
cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts
```

PASS: `sfu-recovery-epoch: all assertions passed`.

```bash
cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts
```

Expected pre-existing failure at `missingPreflightPrereqs` line 400; not a B1 regression.

## Callback Note

Attempted required callback emission first, but the helper rejected the provided validator role/batch scope:

`FATAL: 403 Forbidden: no scoped dispatch manifest for role=validator batch=batch-B1 (cross-role/cross-batch/unscoped ingest rejected)`

STATUS: REPRO-CONFIRMED — R1 harness validly reproduces current give-up behavior for all criteria.
