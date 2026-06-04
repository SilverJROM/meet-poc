# LEAN1 Scenarios

## Scope
- TS1: production timer field types are browser-number clean in `room.page.ts` and `transcripts.page.ts`.
- TS2/TS3: frontend spec doubles are type-clean without changing assertions.
- Dead code: remove only confirmed unused `DatePipe` from `rooms.page.ts`.
- TESTH1: refresh stale backend expectations in `rooms.test.ts`, `sessions-ttl.test.ts`, and `signaling-waiting-room.test.ts`.

## Acceptance Scenarios
- `npx tsc --noEmit` from `frontend/` reports zero errors.
- Every frontend `src/app/**/*.spec.ts` still passes through `npx tsx`.
- `npx ng build` from `frontend/` passes.
- `npx vitest run tests/rooms.test.ts tests/sessions-ttl.test.ts tests/signaling-waiting-room.test.ts` from `backend/` passes.
- No backend source, frontend runtime logic, public API, signal behavior, template behavior, SFU/media behavior, or recorder behavior changes.

