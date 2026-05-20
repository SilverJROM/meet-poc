# DIAGB1 Changes

## User Report
JROM greenlit DIAGB1: DR-6 quick-join with self-preview, DR-7 pre-join validation and clear setup errors, DR-9 host cannot see waiting-to-join knockers without refresh, DR-10 subtle WebAudio doorbell for admitters only.

## Root Cause
DR-9 was not a rendering problem in the sidebar. The frontend already updated `knockers` when a `knock` message arrived, and the backend already emitted `knock` to admitted room owners. The reliability gap was that the authoritative `pending-list` snapshot was only sent on owner join. Post-join waiting state depended on one ephemeral `knock` / `knock-cancelled` edge event, so a missed/out-of-order edge left the host stale until refresh/rejoin forced a snapshot.

## Code Changes
- `backend/src/modules/signaling/index.ts`: added pending-list summary/broadcast helpers and emits authoritative `pending-list` to owners whenever pending state changes, while preserving existing `knock` and `knock-cancelled` wire formats.
- `frontend/src/app/pages/room/room.page.*`: made quick-join the default, moved FIXC2 device dialog behind an expander, added empty-name validation/focus, added mic/camera pre-join toggles, surfaced ICE fallback warnings, made pending-list authoritative, and added debounced doorbell/debug counter behavior.
- `frontend/src/app/components/lobby-preview/*`: added compact mode so the default quick-join preview hides dropdowns and VU while the expanded FIXC2 dialog keeps the full test UI.
- `frontend/src/app/services/ice-config.service.ts`: exposed last fetch error so the lobby can show clear relay-config fallback feedback.
- `backend/tests/signaling-knock-admit.test.ts`: added backend regression for post-join pending-list broadcast.
- `e2e/tests/v3-diagb1-lobby/diagb1-lobby.spec.ts`: added DR-6/7/9/10 browser coverage and screenshots.
- Existing lobby/device e2e specs were updated where they expected device selectors/VU visible by default; they now expand the opt-in device configuration first.

## Caveats
- There is no co-host model in the current backend. "Admitters only" maps to room owner/host behavior already present in signaling.
- No notification-off preference exists yet, so the doorbell respects the available admitter gate and debounce only.
