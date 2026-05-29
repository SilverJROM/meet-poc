# North-Star — Meet Features Run
**Run:** projcore-run-2026-05-28 (features)  
**Date:** 2026-05-28  
**Lifecycle:** pre-live (deferral OFF)  
**Pattern:** 2 — codex-in-tmux

---

## Locked decisions

| # | Decision | Answer |
|---|----------|--------|
| D1 | Guest join: admit flow | Still goes through host-admit lobby. Guest enters name → waits → host admits. |
| D2 | Guest join: what they provide | Room code + display name (two fields on `/join` page). |
| D3 | Open/close model | Controls who can enter the lobby/waiting room. Closed = guests cannot queue up. |
| D4 | Host auto-open trigger | When host receives `admitted` with `isOwner/isHost=true` AND room is closed → auto-open. Manual toggle remains. |
| D5 | Host leave: "Close room" effect | Everyone kicked immediately. Room status → closed. |
| D6 | UI approach | Straight to implementation. Google Meet-inspired. |
| D7 | UI scope | All 4 host pre-call screens: home/rooms list, pre-join/lobby, waiting room/admit, room settings. In-call UI explicitly OUT. |
| D8 | Lifecycle | pre-live — deferral OFF. No TODOs, no deferred cleanup. |
| D9 | Test gate | `ng build` + `npm run build` (backend) + manual DEV smoke by JROM. |
| D10 | Stop policy | NEEDS-INFO to JROM after 3× batch fail. |
| D11 | Commits | One commit per batch on `main`. Format: `feat(<area>): <description>`. |

---

## Scope boundary

IN: `backend/src/modules/signaling/`, `backend/src/modules/rooms/`, `frontend/src/app/pages/join/` (new), `frontend/src/app/pages/rooms/`, `frontend/src/app/pages/room/` (pre-join + admit + leave modal sections), `app.routes.ts`  
OUT: in-call UI, recording/transcript features, auth/registration flow, mobile-specific tweaks
