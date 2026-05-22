# Validation B0 - Codex Independent Validator

Commit: `0dacde5871a5e6fcf8bd3aff740cbb6e9a756ae0`
Branch/HEAD checked: `feat/sfu-cutover` at `0dacde5871a5e6fcf8bd3aff740cbb6e9a756ae0`
Requirement: `SR-0` in `plan/WK_0519/sfu-cutover/og-requirements.md`
Validator role: independent validator, not implementer

## Verdict

FAIL.

The backend source behavior matches SR-0: `MAX_ADMITTED` is raised from 5 to 30, the mobile-specific cap constant/helper/rejection is removed, and the two cap test files are updated to prove 6 total participants and 5+ mobile peers can be admitted.

However, the requested validation step explicitly required confirming commit `0dacde5` "touches NOTHING else." `git show --name-status --stat --summary 0dacde5` shows two additional plan artifacts added by the commit:

- `A plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B0/changes.md`
- `A plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`

Because the commit touches files beyond `backend/src/modules/signaling/index.ts` and the two updated cap tests, the strict scope check fails.

## Diff Scope Evidence

`git show --name-status --stat --summary 0dacde5` changed:

- `M backend/src/modules/signaling/index.ts`
- `M backend/tests/signaling-mobile-cap.test.ts`
- `M backend/tests/signaling-room-full.test.ts`
- `A plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/B0/changes.md`
- `A plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`

`backend/src/modules/signaling/index.ts` diff evidence:

- `const MAX_ADMITTED = 5;` -> `const MAX_ADMITTED = 30;`
- `const MAX_MOBILE_ADMITTED = 4;` removed
- `mobileAdmittedCount(live)` helper removed
- mobile-specific rejection block removed:
  - old behavior sent `mobile room full (4 max)` and closed the websocket

No admit/identity/reconnect logic body was changed beyond removing the mobile-cap guard from the join admission path. The general room-full guard remains `live.admitted.size + live.reconnecting.size >= MAX_ADMITTED`, now using the value 30.

`rg "MAX_ADMITTED|MAX_MOBILE_ADMITTED|mobileAdmittedCount|mobile room full|room full" backend/src/modules/signaling/index.ts backend/tests/signaling-room-full.test.ts backend/tests/signaling-mobile-cap.test.ts` evidence:

- `backend/src/modules/signaling/index.ts:const MAX_ADMITTED = 30;`
- no `MAX_MOBILE_ADMITTED` symbol in signaling source
- no `mobileAdmittedCount` symbol in signaling source
- no `mobile room full` rejection in signaling source
- remaining `room full` checks render `MAX_ADMITTED`

## Test Evidence

Command: `npm run build`
Directory: `backend`
Result: PASS

Output summary:

- `tsc -p tsconfig.json`
- exit code 0

Command: `npm test -- tests/signaling-room-full.test.ts tests/signaling-mobile-cap.test.ts`
Directory: `backend`
Result: PASS

Output summary:

- `tests/signaling-mobile-cap.test.ts`: 2 tests passed
- `tests/signaling-room-full.test.ts`: 1 test passed
- total: 2 test files passed, 3 tests passed

## Final Status

STATUS: VALIDATED-FAIL
