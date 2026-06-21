# Batch B15 Changes

## Branch

`feat/crossplatform-devices-20260604` @ `ddb27f3`

## User Report

"backend admit: don't block legit users; revoke removed-peer identity"

## Root Cause

BK1: `promoteNextActingHost()` used the historical `ownerHasJoined` latch instead of current owner membership, so once an owner had ever joined, guest host promotion stayed blocked after the owner disconnected and expired.

BK2: `removeAdmittedPeer()` removed the live peer but did not revoke the durable admitted `clientKey` identity, so a host-removed participant could rejoin through the durable auto-admit path.

## Code Changes

- `backend/src/modules/signaling/index.ts` - Replaced `ownerHasJoined` with `hasOwnerPresentOrReconnecting()`, which blocks acting-host promotion while the owner is admitted or in reconnect grace, and promotes after owner reconnect expiry or explicit owner leave.
- `backend/src/modules/signaling/index.ts` - Added explicit identity revocation for host `remove-peer` and explicit `leave`, while preserving drop/reconnect durable identity.
- `backend/tests/signaling-acting-host.test.ts` - Added owner-disconnect-grace-expiry coverage proving no acting host during owner grace, then guest promotion and pending-user admission after expiry.
- `backend/tests/signaling-host-actions.test.ts` - Added same-`clientKey` host-removal coverage proving the removed peer returns to `knocking` instead of auto-admit.

## Verification

- PASS: `npm test -- tests/signaling-acting-host.test.ts tests/signaling-host-actions.test.ts tests/signaling-reconnect.test.ts` (22 tests)
- PASS: `npm run build`

## Caveats

- None.
