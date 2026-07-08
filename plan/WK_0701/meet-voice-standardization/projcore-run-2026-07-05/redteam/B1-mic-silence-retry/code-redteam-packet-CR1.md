# CODE RED-TEAM — B1 mic-silence retry — CR1
# Tier: standard. Roles: codex55, spark, grokbuild, grokcompose.

## Context
R1 was implemented in commit `d2cbce9`: it replaces the one-shot mic-silence sweep latch with
a bounded retry gate. Prior validation passed unit/build, but JROM requires red-team plus
dev_machine/Peer2 confirmation before handback. This round attacks structural correctness and
false-positive retry/exhaustion behavior.

## Read
- Real files: `frontend/src/app/services/mic-energy.ts`,
  `frontend/src/app/pages/room/room.page.ts`, `frontend/src/app/services/mic-sweep.spec.ts`
- Diff: `plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/redteam/B1-mic-silence-retry/IMPL-prod-diff.patch`
- Contract: `plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/og-requirements.md` R1
- Prior validation: `plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-03/batch-1/independent-validation.md`

## Bar
While a local mic remains classified silent, the app must keep retrying recovery on a bounded
5-10s active cadence instead of stopping after one sweep. It must not storm getUserMedia,
consume retry budget without running recovery, or regress track-failure/devicechange recovery.

## Your task
Audit the actual code and tests. Find proven bugs only, with file:line evidence:
1. Does `nextSweepGate` correctly model first retry, cooldown, attempt cap, duration cap, and re-arm?
2. Can `audioRecoveryInFlight`, mute/unmute, devicechange, or initial-capture paths consume attempts without a real sweep?
3. Can the banner get stuck in retry or exhausted copy after recovery?
4. Are tests outcome-level and do they cover the acceptance boundaries honestly?
5. Any platform/runtime issue from the changed code path that would break real calls?

## Output
Write `plan/WK_0701/meet-voice-standardization/projcore-run-2026-07-05/redteam/B1-mic-silence-retry/<role>-coderedteam-CR1.md`:

```
# <role> CODE red-team CR1
## Findings
## NEW bugs
table: severity | file:line | what breaks | concrete fix
## Scenario trace
STATUS: CLEAN — no real bug under this lens
```

or:

`STATUS: BUGS — <one-line worst>`
