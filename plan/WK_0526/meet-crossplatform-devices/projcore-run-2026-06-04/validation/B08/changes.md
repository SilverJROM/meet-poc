# Batch B08 Changes

## Branch: `feat/crossplatform-devices-20260604`

Cut from current branch checkpoint @ `3204f4c`. Not committed in this pass; projcore owns final validation and merge flow.

## User Report (verbatim from brief)

"the subscribe-stuck watchdog only LOGS after no ontrack fires; it never tears down the subscription guard or retries -> a successful-but-no-media subscribe permanently loses that remote's audio."

## Root Cause (mechanism-level)

`SfuClientService.armSubscribeStuckWatchdog()` only logged when a subscribed publisher produced no `ontrack`, and `doSubscribe()` cleared `subscribeRetryAttempts` as soon as CF accepted the subscribe before media arrived. A successful-but-no-media subscribe therefore left `subscribedClientIds` set forever and could not count stuck retries toward the cap.

## Code Changes

- `frontend/src/app/services/sfu-roster-utils.ts` - Added pure `planSubscribeRetry()` to centralize first-frame, cap, and backoff decisions.
- `frontend/src/app/services/sfu-client.service.ts` - Routed subscribe failure and subscribe-stuck retry decisions through the shared planner; on stuck timeout, clears only that publisher's subscription state and bumps `subscribeRetryVersion` after bounded backoff so the existing serialized `subscribeIfNeeded()` path retries.
- `frontend/src/app/services/sfu-client.service.ts` - Moved retry-attempt reset from CF subscribe success to first `ontrack`, so successful-but-no-media subscribes count toward `SUBSCRIBE_RETRY_CAP`.
- `frontend/src/app/services/sfu-client.spec.ts` - Added pure assertions for stuck retry, cap-respected final retry, healthy no-retry, and capped no-storm behavior.
- `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md` - Appended B08 PROPOSED and DONE callbacks.

## Commits

- Not committed - held for projcore independent validator pass.

## Standing Rules

- Future SFU subscribe retries must not clear retry attempts until media arrives; CF acceptance alone is not proof that remote media is flowing.

## Verification

- Focused spec: PASS (`npx tsx src/app/services/sfu-client.spec.ts` from `frontend/`)
- Focused spec: PASS (`/home/agjrom/websites/meet-poc/node_modules/.bin/tsx ./sfu-client.spec.ts` from `frontend/src/app/services/`)
- Build: PASS (`npx ng build` from `frontend/`)

## Bug Reproductions

- Before: mechanism reproduced by code inspection - stuck watchdog timer only logged and left `subscribedClientIds` set, while `doSubscribe()` reset retry attempts before first media.
- After: focused pure assertions verify retry/cap/healthy/capped decisions; Angular build verifies service integration.

## Caveats

- [PRE-EXISTING] `npx ng build` still reports warnings for unused `DatePipe` in `RoomsPage`, Stencil empty glob, and Mediapipe CommonJS. Not introduced by B08.
