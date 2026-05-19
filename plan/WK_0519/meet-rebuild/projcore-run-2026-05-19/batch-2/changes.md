# Batch 2 Changes — Rooms API + Signaling

## User Report Verbatim

> Batch B2 — Rooms API + signaling (raw WebSocket)
>
> Requirements assigned: R2.1-R2.5 (Rooms CRUD: create / list-own / delete-own / public-exists / 12-hex id) and R3.1-R3.8 (Signaling: join, owner auto-admit, knock, admit/reject, signal relay, peer-left, wire-format identity, 8-peer soft cap).

## Root Cause

B1 established auth/session persistence but the rebuilt backend still lacked room ownership data and a real `/ws` signaling protocol. Without a rooms table and owner-aware store, the backend could not decide which authenticated socket should auto-admit or receive waiting-room events. Without porting the legacy `ws.on('connection')` handler, the new backend could only echo messages and could not close R3.

B2 closes that mechanism by adding SQLite-backed room CRUD, protected room routes using the B1 session cookie, and a signaling module that preserves the legacy message shapes from `legacy-poc/server.js:240-357` while adding the required 8-peer soft cap.

## Code Changes

- `backend/migrations/0002_rooms.sql` — adds `rooms` table plus owner/created indexes.
- `backend/src/modules/auth/middleware.ts` — adds `requireAuth()` middleware that reads the session cookie and sets authenticated request state.
- `backend/src/modules/rooms/store.ts` — adds pure SQLite helpers: `getRoom`, `isOwnerOf`, `listOwnedRooms`, `createRoom`, `deleteRoom`.
- `backend/src/modules/rooms/index.ts` — adds protected create/list/delete routes and public exists route under `/api`.
- `backend/src/modules/signaling/index.ts` — replaces the B1 echo placeholder with legacy-compatible knock/admit/reject/signal/peer-left protocol and 8-peer room cap.
- `backend/src/server.ts` — mounts rooms under `/api` and delegates `/ws` upgrade handling to `attachSignaling()`.
- `backend/tests/rooms.test.ts` — covers S2.1-S2.5 API behavior.
- `backend/tests/signaling-helpers.ts` — adds ephemeral HTTP server + real `ws` client harness.
- `backend/tests/signaling-auto-admit.test.ts` — covers S2.6 owner auto-admit.
- `backend/tests/signaling-knock-admit.test.ts` — covers S2.7 and S2.8 knock/admit/reject.
- `backend/tests/signaling-signal-relay.test.ts` — covers S2.9 admitted-peer signal relay.
- `backend/tests/signaling-peer-left.test.ts` — covers S2.10 peer-left after admitted peer disconnect.
- `backend/tests/signaling-room-full.test.ts` — covers S2.11 8-peer cap with 9th join rejection.
- `backend/tests/signaling-wire-format.test.ts` — covers S2.12 legacy message key shapes for admitted, knocking, knock, peer-joined, knock-cancelled, signal, and peer-left.

## Wire-Format Reference

- `legacy-poc/server.js:247-254` -> admit sends `{type:'admitted', clientId, peers, roomTitle, isOwner}`, broadcasts `{type:'peer-joined', clientId, name}`, then `{type:'knock-cancelled', clientId}`.
- `legacy-poc/server.js:263-265` -> reject sends `{type:'rejected', reason}` and broadcasts `{type:'knock-cancelled', clientId}`.
- `legacy-poc/server.js:296-309` -> owner auto-admit sends `{type:'admitted', clientId, peers, roomTitle, isOwner:true}` plus optional `{type:'pending-list', knockers}`.
- `legacy-poc/server.js:312-315` -> guest join sends `{type:'knocking', clientId, roomTitle}` and owner receives `{type:'knock', clientId, name}`.
- `legacy-poc/server.js:321-328` -> signal relay sends `{type:'signal', from, data}`.
- `legacy-poc/server.js:345-353` -> close sends `{type:'peer-left', clientId}` or pending `{type:'knock-cancelled', clientId}`.

## Autonomous Decisions

- Decision file written: `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/decisions/2026-05-19-b2-admitted-state-transition.md`.

## Modules Touched + Cross-Module Imports

- `auth` exposes `requireAuth()` middleware and continues to depend only on `db`, `lib/cookies`, and auth sessions.
- `rooms` depends on `db` and `auth.requireAuth`.
- `signaling` depends on `db`, `lib/cookies`, `auth.getSessionUser`, and `rooms.getRoom/isOwnerOf`.
- No frontend, recording, CF Tunnel, PM2 restart, or legacy runtime changes were made.

## Caveats / Things To Revisit

- The 8-peer cap applies to owner sockets too, per the B2 brief. A 9th owner connection receives `{type:'error', error:'room full (max 8)'}` and closes.
- `reject {reason}` uses the supplied reason when present, satisfying R3.4/S2.8 while preserving the same `{type:'rejected', reason}` payload shape.
- Live room state is in-memory like the legacy PoC; process restart clears admitted/pending peers.
