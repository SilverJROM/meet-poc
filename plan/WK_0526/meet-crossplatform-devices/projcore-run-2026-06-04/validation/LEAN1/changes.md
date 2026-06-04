# LEAN1 Changes

User Report verbatim:
`Scope: 1) fix the 10 production TS1 timer-type errors (number vs Timeout in room.page.ts + transcripts.page.ts), 2) make the 13 spec type-drift errors clean so npx tsc --noEmit is ZERO (types only, assertions unchanged, specs still pass via tsx), 3) remove genuinely-dead code only, 4) TESTH1 refresh the pre-existing red backend tests (rooms slug-format/sessions-ttl/waiting-room) to green by updating TEST EXPECTATIONS to the correct current app behavior — NOT backend source; if any is a real bug not a stale expectation, STOP and flag NEEDS-INFO, 5) modular extraction is PROPOSE-ONLY and projcore-gated by risk — do NOT do a wholesale room.page.ts rewrite, the logic is already extracted into 11 modules.`

## Root Cause
- Production TS1 errors came from fields typed via Node timer overloads while browser `window.setTimeout` and `window.setInterval` return `number`.
- Spec TS2/TS3 errors were stale test-double typings: readonly Web API fields mutated in fake objects, current Angular `createEnvironmentInjector` typing requiring a parent argument, and one fake peer connection inferred too narrowly.
- Backend failures were stale expectations for current correct behavior: clean slugs, enriched `/api/me` and `/api/rooms/:id/exists` response bodies, and owner admission auto-opening closed rooms.

## Per-File Changes
- `frontend/src/app/pages/room/room.page.ts`: changed timer fields to `number | null`; used `window.setInterval/window.clearInterval/window.clearTimeout` for the affected browser timer handles. WHY: static type-only correction; timer timing/callbacks unchanged.
- `frontend/src/app/pages/transcripts/transcripts.page.ts`: changed `pollTimer` to `number | null`. WHY: static type-only correction for `window.setInterval`.
- `frontend/src/app/services/media-acquisition.spec.ts`: made fake track a mutable local test double before casting to `MediaStreamTrack`. WHY: readonly-safe construction; assertions unchanged.
- `frontend/src/app/services/media-screen.spec.ts`: added typed mutable fake screen track and explicit parent parameter cast for `createEnvironmentInjector`. WHY: type drift cleanup; assertions unchanged.
- `frontend/src/app/services/recorder-leaks.spec.ts`: added typed mutable fake recorder and passed an `Event` to `onstop`. WHY: readonly-safe test double and current event-handler shape; assertions unchanged.
- `frontend/src/app/services/sfu-client.spec.ts`: added explicit parent parameter cast for `createEnvironmentInjector` and typed the screen-publish fake PC. WHY: type drift cleanup; assertions unchanged.
- `frontend/src/app/pages/rooms/rooms.page.ts`: removed `DatePipe` import and standalone imports entry. WHY-safe: `rooms.page.html` has no `date` pipe usage; this is genuinely unused.
- `backend/tests/rooms.test.ts`: updated expected first generated slug from suffixed form to clean `team-sync`; updated duplicate-title expectations to first clean `weekly-sync`, second suffixed `weekly-sync-[4 hex]`; updated `/exists` bodies to include `passwordRequired: false` and `isOwner: false`.
- `backend/tests/sessions-ttl.test.ts`: updated expired `/api/me` expectation to include `diagnosticsGloballyEnabled: true` while still asserting expired session row deletion.
- `backend/tests/signaling-waiting-room.test.ts`: restructured the promotion test so the guest waits first, then owner admission auto-opens the room, promotes the guest into `knocking`, emits owner `knock`, and admits the guest. WHY: preserves original intent under current app behavior.

## Runtime Statement
NO runtime behavior changed. Backend source was not touched. Frontend behavior logic, templates, public API contracts, signals, media/SFU flows, and recorder logic were not changed.

## Extraction
No extraction performed.

Autonomous decisions: none.

