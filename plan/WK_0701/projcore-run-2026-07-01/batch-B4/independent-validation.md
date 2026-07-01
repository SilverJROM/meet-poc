# Batch B4 Independent Validation — R4 Publish/PC-Failure Recovery

## Verdict

**REPRO-STILL-PRESENT**

R4 is not fully cleared. The service-level publish recovery entry point is guarded and throttled correctly, and the required specs pass, but the room-page wiring misses the primary terminal initial-publish failure paths because it calls `escalatePublishFailure()` only inside the old `shouldSurfacePublishFailure(...)` guard.

## Required Test Runs

| Command | Result |
|---|---|
| `cd frontend && timeout 45 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | PASS — `sfu-recovery-coordinator: all assertions passed` |
| `cd frontend && timeout 45 npx tsx src/app/services/sfu-client.spec.ts` | PASS — `sfu-client roster utils: all assertions passed` |

## R4 Criteria

| Criterion | Verdict | Evidence |
|---|---|---|
| R4a detect media-not-published (`hasPc:false` / `localPublishState null|'error'`) | **Partial** | `isLocalPublishHealthy()` correctly treats non-`published`, missing PC, failed PC, and closed PC as unhealthy in `frontend/src/app/services/sfu-client.service.ts:208`. The new `escalatePublishFailure()` accepts `null|'error'` and no-ops only for healthy or `publishing` states at `sfu-client.service.ts:472`. However, app-level post-join detection is incomplete because the room page does not call escalation on the main already-surfaced failure exits. |
| R4b auto-recover, no manual leave | **Fail** | `publishInitialSfuWithRetry()` calls `this.sfuClient.escalatePublishFailure()` only inside `shouldSurfacePublishFailure(...)` at `frontend/src/app/pages/room/room.page.ts:1865` and `room.page.ts:1875`. That predicate returns true only when the gate is still `audio-connecting` (`frontend/src/app/pages/room/room-decisions.ts:237`). The transceiver-check failure path sets `audio-failed` and returns at `room.page.ts:1802-1812`; the permanent/retry-cap path sets `audio-failed` and returns at `room.page.ts:1830-1841`. Those are real terminal publish failures, but they skip the new escalation and still require the user-visible manual path. |
| R4b capped transport branch | **Pass** | `handleTransportStateChange()` now calls `this.escalatePublishFailure()` in the `capped` branch at `frontend/src/app/services/sfu-client.service.ts:995-1002`. The coordinator spec covers this via `CAPPED-WIRES-TO-ESCALATE` at `frontend/src/app/services/sfu-recovery-coordinator.spec.ts:741-765`. |
| R4c unrecoverable explicit UI | **Pass** | `publishRecoveryFailed` drives a host-agnostic notice at `frontend/src/app/pages/room/room.page.ts:497-501`, rendered with a Rejoin button at `frontend/src/app/pages/room/room.page.html:244-247`. Screenshot proof is real call UI, not login/blank: `plan/WK_0701/projcore-run-2026-07-01/batch-B4/screenshots/b4-publish-recovery-unrecoverable-notice.png`. |

## Red-Team Lenses

| Lens | Verdict | Evidence |
|---|---|---|
| CLOBBER: healthy/publishing calls must not rotate a working call | **Pass** | `escalatePublishFailure()` exits for `isLocalPublishHealthy()` and `status === 'publishing'` before scheduling rejoin at `sfu-client.service.ts:472-475`. Tests assert no handler call for both states at `sfu-recovery-coordinator.spec.ts:679-718`. |
| B2a/B2b regression from extracted `runFullSfuRejoin()` body | **Pass** | `runFullSfuRejoin()` preserves the original `status === 'published'` precondition before delegating at `sfu-client.service.ts:462-464`. Full coordinator spec passed locally under the validator command. |
| Stuck banner | **Pass with minor residual risk** | Successful `publish()` clears `publishRecoveryFailed` at `sfu-client.service.ts:2189-2190`, covered by `sfu-client.spec.ts:1043-1063`. I did not find a path where a later successful publish leaves the banner stuck true. |
| Publish storm | **Pass** | Publish escalation shares `rejoinScheduled` and `sfuRejoinTimestamps` with subscribe-side rejoin at `sfu-client.service.ts:472-520`. `THROTTLE-SHARED` asserts a publish-triggered escalation is throttled after two subscribe-triggered rejoins at `sfu-recovery-coordinator.spec.ts:770-801`. |

## Test Honesty Check

The new B4 service tests assert outcomes, not only call presence:

- unhealthy/null publish triggers one shared executor run and clears the failure flag after simulated republish
- healthy publish does not call the handler
- in-flight `publishing` does not call the handler
- failed republish sets `publishRecoveryFailed`
- capped transport branch triggers escalation
- shared throttle prevents a third rejoin and still surfaces unrecoverable state
- successful real `publish()` clears `publishRecoveryFailed`

Coverage gap: no test proves `publishInitialSfuWithRetry()` escalates after the inner terminal failure paths that already set `audio-failed`. Source trace shows those paths currently do **not** escalate.

## Required Fix

Move or duplicate the `this.sfuClient.escalatePublishFailure()` call so it runs for every terminal unsuccessful initial-publish exit, including the paths that already set `preflightGateStatus` to `audio-failed` before returning. The old `shouldSurfacePublishFailure(...)` guard is too narrow for R4 recovery because it was designed only to repair the `audio-connecting` state-revert case.

STATUS: REPRO-STILL-PRESENT — initial-publish terminal failures that set `audio-failed` skip automatic publish recovery.

## Iter 2 re-validation

**Verdict: REPRO-CLEARED-ON-LOCAL**

R4b is now met. The two terminal initial-publish exits that previously bypassed recovery now directly mark the stale publish attempt failed and trigger automatic publish recovery:

| Path | Verdict | Evidence |
|---|---|---|
| Transceiver-check terminal exit | **Pass** | `frontend/src/app/pages/room/room.page.ts:1802-1812` sets `audio-failed`, calls `markPublishAttemptFailed('outbound-rtp audio transceiver not established')`, then calls `escalatePublishFailure()`. This covers the stale `published` state left after `publish()` itself succeeded but outbound audio never established. |
| Retry-cap/permanent terminal exit | **Pass** | `frontend/src/app/pages/room/room.page.ts:1837-1849` sets `audio-failed`, calls `markPublishAttemptFailed(String(err))`, then calls `escalatePublishFailure()`. This covers both the common `error` state and the rarer stale `published` state from a later publish step. |
| Stale-state correction | **Pass** | `frontend/src/app/services/sfu-client.service.ts:476-480` changes only `localPublishState.status === 'published'` to `error`. It does not clobber `publishing`, `error`, or `null`, and healthy/publishing protection remains in `escalatePublishFailure()` at `sfu-client.service.ts:487-490`. |

Previously passed coverage remains intact:

| Area | Verdict | Evidence |
|---|---|---|
| Clobber guard | **Pass** | `escalatePublishFailure()` still no-ops for healthy published state and in-flight `publishing`; coordinator tests cover both. |
| B2a/B2b regression | **Pass** | Subscribe-side `runFullSfuRejoin()` still requires `localPublishState.status === 'published'` before delegating to the shared executor. |
| Capped branch | **Pass** | The transport capped branch still calls `escalatePublishFailure()` at `sfu-client.service.ts:1010-1017`. |
| Stuck banner | **Pass** | Successful `publish()` clears `publishRecoveryFailed` at `sfu-client.service.ts:2204-2205`; `sfu-client.spec.ts` covers this. |
| Publish storm | **Pass** | Publish escalation still shares `rejoinScheduled` and the shared `sfuRejoinTimestamps` budget with subscribe recovery. |
| R4c UI | **Pass** | `publishRecoveryFailed` still drives the host-agnostic terminal notice in `room.page.ts` and `room.page.html`. |

Required test runs:

| Command | Result |
|---|---|
| `cd frontend && timeout 45 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts` | PASS — `sfu-recovery-coordinator: all assertions passed` |
| `cd frontend && timeout 45 npx tsx src/app/services/sfu-client.spec.ts` | PASS — `sfu-client roster utils: all assertions passed` |

STATUS: REPRO-CLEARED-ON-LOCAL — R4b auto-recovery now fires from both terminal initial-publish exits, stale `published` state is corrected before escalation, and required regression specs pass.
