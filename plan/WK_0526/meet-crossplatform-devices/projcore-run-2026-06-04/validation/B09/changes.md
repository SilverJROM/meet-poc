# Batch B09 Changes

## Branch: `feat/crossplatform-devices-20260604`

Cut from current branch checkpoint @ `d96cc24`. Not committed in this pass; projcore owns final validation and merge flow.

## User Report (verbatim from brief)

"the publish IIFE on join is fire-and-forget; its .catch only sets actionNotice ("refresh"), with NO retry, NO state change, NO rejoin -> user stranded in-call, UNPUBLISHED, peers can't hear them; only manual refresh recovers."

## Root Cause (mechanism-level)

`RoomPage.handleMessage()` set the local state to `in-call`, then launched first SFU publish in a fire-and-forget async block. If `sfuClient.publish()` failed, the catch only displayed a passive refresh notice, leaving `localPublishState` unpublished and remote peers with no `sfu-publish` announcement.

## Code Changes

- `frontend/src/app/services/sfu-roster-utils.ts` - Added pure `planInitialPublishRetry()` with success, retry, capped, and permanent outcomes plus explicit `shouldAnnounce`.
- `frontend/src/app/pages/room/room.page.ts` - Extracted first publish into `publishInitialSfuWithRetry()` with 3-attempt bounded backoff and status-gated `sfu-publish` after success only.
- `frontend/src/app/pages/room/room.page.ts` - Added after-cap Retry audio/video and Rejoin actions; Retry reuses the helper only while still in-call and unpublished, Rejoin uses cleanup plus the existing join path.
- `frontend/src/app/services/sfu-client.service.ts` - Added `resetFailedPublishAttempt()` to close and clear only an unpublished failed publish attempt between retries.
- `frontend/src/app/pages/room/room.page.html` - Rendered the first-publish failure notice with Retry/Rejoin controls.
- `frontend/src/app/services/sfu-client.spec.ts` - Added pure assertions for success-no-retry, retryable-until-cap, capped-after-cap, permanent-after-cap, and no announcement on intermediate/capped/permanent failure.
- `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04/callbacks.md` - Appended B09 PROPOSED and DONE callbacks.

## Commits

- Not committed - held for projcore independent validator pass.

## Standing Rules

- First-publish retry logic must never announce `sfu-publish` unless `localPublishState.status === 'published'`; intermediate and capped failures stay unannounced.

## Verification

- Focused spec: PASS (`npx tsx src/app/services/sfu-client.spec.ts` from `frontend/`)
- Build: PASS (`npx ng build` from `frontend/`)

## Bug Reproductions

- Before: mechanism reproduced by code inspection - publish failure catch only set a passive refresh notice after entering `in-call`.
- After: pure tests verify retry/no-announce decisions; Angular build verifies room-page template and service integration.

## Caveats

- [PRE-EXISTING] `npx ng build` still reports warnings for unused `DatePipe` in `RoomsPage`, Stencil empty glob, and Mediapipe CommonJS. Not introduced by B09.
