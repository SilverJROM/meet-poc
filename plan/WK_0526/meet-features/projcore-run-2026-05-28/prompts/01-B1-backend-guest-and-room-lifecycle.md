# B1 — Backend: guest WS support + room lifecycle (R4, R5, R7)

**Consultation outcome:** I AGREE on all 11 PROPOSE-CHANGES items. Locked in `decisions/2026-05-28-consultation-agreements.md`. The four B1-scoped corrections are applied below.

## Scope

### R4 — Guest WS path (no session cookie required)
Files: `backend/src/modules/signaling/index.ts`

- WS upgrade already permits unauthenticated connections — `userEmail` can be `null` at the `join` handler. DO NOT add or remove middleware.
- Inside the `join` message handler (around line 660), when `userEmail` is null:
  - Accept the connection as a GUEST if `msg.name` is non-empty (treat blanks/whitespace as invalid → send `{type:'error', error:'name required'}` and close).
  - Continue the existing flow: ephemeral `clientId`, durable `clientKey` if provided, `participantId` = crypto.randomUUID() OR resume-source if found.
  - `myName` = sanitized `msg.name` (already truncated to 64 chars).
  - DO NOT auto-admit guests — they go through the same knock/admit path as registered users (R3).
  - Mark the live entry as `isGuest: true` for downstream logic if helpful, but don't gate functionality on it (guest has same in-call permissions as a non-host admitted user).
- Owner detection (`isOwnerOf(...)`): guests are NEVER owner. Continue with the existing logic — `userEmail = null` will naturally fail `isOwnerOf`. Good.

### R5 — Host auto-open closed room (backend-driven)
Files: `backend/src/modules/signaling/index.ts`, `backend/src/modules/rooms/store.ts`

- Add an owner-safe helper in `rooms/store.ts`:
  ```ts
  export function openRoomBySystem(database: Database, roomId: string): Room | null { ... }
  ```
  - Sets `is_open = 1` for the row, returns the updated `Room` shape.
  - Does NOT require an owner-email param. Trusted backend caller only.
  - If the existing `setRoomAccess` can be cleanly reused with a system-caller signal, that's fine too — implementer choice.
- In `signaling/index.ts`, on the owner admit path (when a registered owner joins/admits): if `room.is_open === 0`, call `openRoomBySystem(database, roomId)` and broadcast `{type:'room-opened'}` to all admitted clients. The existing manual open/close toggle remains and is unaffected.
- Exact trigger placement: on owner being ADMITTED (i.e. when they reach the in-call state). Look for the existing owner-admit branch around line 770–795.

### R7 — Close-room broadcast + kick everyone
Files: `backend/src/modules/signaling/index.ts`, `backend/src/modules/rooms/store.ts`

- Add a new owner-safe helper:
  ```ts
  export function closeRoomBySystem(database: Database, roomId: string): Room | null { ... }
  ```
  - Sets `is_open = 0`, returns updated row. Trusted backend caller only.
- Add a new INCOMING WS message type handled in `signaling/index.ts` and in `ws.service.ts` outgoing union: `{type:'close-room'}`. Only owners may send it (silently ignore from non-owners — symmetric with other host-only messages).
- Handler behavior:
  1. Call `closeRoomBySystem(database, roomId)`.
  2. Broadcast `{type:'room-closed', reason?:'host'}` to ALL admitted clients (including the owner-sender).
  3. Send `{type:'room-closed', reason:'host'}` to all PENDING knockers + `closedWaiters`.
  4. Disconnect all admitted/pending/closedWaiters WS sockets (close code 1000, "room closed by host").
  5. Clean up live room state (mirror what `meeting-ended-by-host` does for the participant list, but with the `is_open = 0` set).
- DO NOT reuse the existing `meeting-ended-by-host` path. R7 is distinct.

## Hard constraints

- ONLY touch `backend/src/modules/signaling/index.ts` and `backend/src/modules/rooms/store.ts`. If you need a type added to `rooms/index.ts` for a re-export, that's OK; keep the change surgical.
- Add the outgoing type `'room-closed'` and incoming type `'close-room'` to `frontend/src/app/services/ws.service.ts` type union ONLY (no consumer wiring in this batch — B3 wires frontend behavior). This is the minimum cross-cut to keep TS happy.
- Frontend room.page.ts / room.page.html / app.routes.ts are OFF-LIMITS for B1. Those belong to B2/B3.

## Acceptance gate (you do these before reporting DONE)

1. `cd backend && npm run build` — 0 errors. (Backend uses tsc/esbuild — confirm 0 type errors.)
2. `cd frontend && ng build` — 0 errors. (The ws.service.ts type addition must not break consumers.)
3. Manual code review: confirm the four scoped changes are in place and no in-call UI was touched.
4. Write `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B1-changes.md`: files touched, what each change does, why. Include the exact line of the auto-open trigger placement.
5. Commit: `feat(signaling): guest WS support + owner auto-open + close-room broadcast`. One commit.

## Stop conditions

- 3× backend OR frontend build failure → STOP, write `validation/B1-blocker.md`, do NOT push.
- If you discover a backend route for "close-room" already exists in some other form, STOP and report before adding a new one.

Final line MUST be: `STATUS: DONE — B1 ready for validation`.
