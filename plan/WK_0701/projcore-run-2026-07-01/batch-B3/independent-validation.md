# Batch B3 — Independent Validation

Validator: codex55  
Date: 2026-07-01  
Scope: R3 stalled remote-audio detection -> recovery, with standard red-team lens

## Verdict

REPRO-CLEARED-ON-LOCAL.

The B3 runtime diff satisfies R3a/R3b/R3c: healthy mic-off silence does not escalate, mic-on/unknown broken inbound audio escalates into the shared B2a/B2b SFU recovery coordinator, and the new recovery entry point is scoped per publisher. I did not find a B3 red-team break.

## Diff Audited

- `frontend/src/app/pages/room/room-decisions.ts`
- `frontend/src/app/pages/room/room.page.ts`
- `frontend/src/app/services/sfu-client.service.ts`
- `frontend/src/app/pages/room/room-decisions.spec.ts`
- `frontend/src/app/services/sfu-recovery-coordinator.spec.ts`

Coordinator/status artifacts were present in the worktree; they are not runtime B3 logic.

## Criterion Results

| Criterion | Result | Evidence |
|---|---:|---|
| R3a healthy silence vs broken | PASS | `decideRemoteVoiceWatchdogAction()` returns `clear` for bytes-flat + `publisherMicEnabled === false`, with attempts reset to 0. The room adapter now passes `peer?.micEnabled`, so a known mic-off publisher does not churn SFU recovery. Emitted progress still short-circuits through `note-emission-advanced`, preserving the reset-to-0 path when real playout resumes. |
| R3b broken -> recovery | PASS | Bytes-flat + mic-on or mic-unknown now returns `escalate-recovery`, not `clear`. Bytes-arriving/emitted-stalled still runs the existing playout ladder first; once `VOICE_RECOVERY_MAX_ATTEMPTS_PER_WINDOW` is exhausted, the reducer now returns `escalate-recovery` instead of terminal `mark-stalled`. `room.page.ts` maps that action to `sfuClient.escalateStalledRemoteAudio(publisherClientId)`. |
| R3b uses B2a coordinator | PASS | `SfuClientService.escalateStalledRemoteAudio()` is a thin public entry point that calls existing `scheduleRecoveryEscalation(publisherClientId, hasFirstFrame)`. No separate recovery loop, new timer family, or parallel attempt state was introduced. |
| R3c per-publisher no clobber | PASS | The coordinator continues to key rung attempts and low-frequency timers by `publisherClientId`. New spec calls `escalateStalledRemoteAudio('bob')` with healthy `alice` also present and asserts only Bob receives `lastRecoveryEvent`, rung-1 state, and one armed timer; Alice has no rung-1/rung-2/low-frequency state. |
| `mark-stalled` removed | PASS | The `RemoteVoiceWatchdogAction` union and production `room.page.ts` switch no longer contain a `mark-stalled` action/case. Remaining `mark-stalled` matches are historical artifact text or descriptive test strings, not dangling action consumers. |
| Attempts reset when audio resumes | PASS | Existing `note-emission-advanced` path remains ahead of recovery/escalation and returns `nextAttemptsThisWindow: 0`. The B3 assertions before the pre-existing abort include this unchanged reset path. |

## Red-Team Notes

- Mic-off false positive: checked the no-bytes branch. Only `publisherMicEnabled === false` clears as healthy silence; it does not call the coordinator. A stale or unknown mic state intentionally escalates per the brief's mic-on/unknown rule.
- Repeated stalled polls: after playout cap exhaustion, repeated decisions keep returning `escalate-recovery` with attempts capped, replacing silent terminal give-up. Downstream scheduling remains bounded by the existing coordinator caps/timers.
- Healthy neighbor disruption: no path in the B3 diff iterates all publishers for the first escalation. Full SFU rejoin remains a later B2b rung after same-session recovery is exhausted; the direct B3 handoff is per publisher.
- Energy wording: inherited tests already treat bytes-climbing + emitted-flat + voice-energy as a playout-stall shape requiring playout recovery. I did not treat that inherited model as a B3 failure; B3's reset-on-resume proof is the existing emitted-progress `note-emission-advanced` path, which the validator brief explicitly names.

## Test Results

### `cd frontend && timeout 40 npx tsx src/app/services/sfu-recovery-coordinator.spec.ts`

PASS. Output ended with:

```text
sfu-recovery-coordinator: all assertions passed
```

### `cd frontend && timeout 30 npx tsx src/app/pages/room/room-decisions.spec.ts`

EXPECTED OUT-OF-SCOPE FAIL after B3 assertions ran and passed. The process exits 1 at the known preflight assertion:

```text
AssertionError [ERR_ASSERTION]: R1: no mic access -> mic blocked + speaker untested
actual: [ 'mic' ]
expected: [ 'mic', 'speaker' ]
at .../frontend/src/app/pages/room/room-decisions.spec.ts:431:8
```

The R3 blocks at lines 215-360 run before this abort and did not fail. They assert outcomes, not only call presence:

- mic-off bytes-flat -> `clear`, `deletePeer: false`, attempts reset
- mic-on bytes-flat -> `escalate-recovery`
- mic-unknown bytes-flat -> `escalate-recovery`
- playout-window exhausted -> `escalate-recovery`, not `mark-stalled`
- repeated post-cap polls -> still `escalate-recovery`

I also confirmed base commit `e9aedff` had the same preflight expectation while `missingPreflightPrereqs()` was implemented as mic-only, so the current abort is pre-existing and out of B3 scope.

## Final Status

STATUS: REPRO-CLEARED-ON-LOCAL — R3 validation passed; known room-decisions preflight failure is pre-existing/out of scope.
