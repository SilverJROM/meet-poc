# Implementation Plan — Meet Features Run
**Created:** 2026-05-28  
**Lifecycle:** pre-live (deferral OFF)  
**Pattern:** 2 — codex-in-tmux, session `lkvc-38-features`  
**Child session:** `lkvc-38-feat-codex`

---

## Batch overview

| Batch | Title | Req | Est | Primary files |
|-------|-------|-----|-----|---------------|
| B1 | Backend: guest WS auth + room open/close events | R4, R5, R7 | 25min | `backend/src/modules/signaling/index.ts`, `backend/src/modules/rooms/` |
| B2 | Frontend: guest join flow (`/join` + `/join/:slug` overlay) | R1, R2, R3 | 25min | `app.routes.ts`, new `join` page, `room.page.ts` |
| B3 | Frontend: host auto-open + leave modal | R5, R6, R7 | 20min | `room.page.ts`, room WS handling |
| B4 | UI: home/rooms list redesign | R8 | 25min | `rooms.page.ts`, `rooms.page.html`, `rooms.page.scss` |
| B5 | UI: pre-join/lobby screen redesign | R9 | 25min | `room.page.html` (pre-join section), `room.page.scss` |
| B6 | UI: waiting room/admit screen redesign | R10 | 20min | `room.page.html` (admit section), admit-related component |
| B7 | UI: room settings/management redesign | R11 | 20min | settings-related room pages/components |
| B8 | Build + deploy + DEV smoke | ALL | 15min | build + PM2 |

---

## B1 — Backend: guest WS auth + room open/close events (R4, R5, R7)

**Guest WS auth:**
- Current WS auth likely validates a user session cookie. Add a guest token path: client can connect with `?guestName=<name>&guestId=<uuid>` query params OR a short-lived guest token in `Authorization`.
- On guest connect: assign ephemeral participantId, store `isGuest: true` in the session state. Guest goes to the lobby (same as registered user) and waits for host admit.
- Guest identity in all WS messages: uses `guestName` as `displayName`.

**Room auto-open (R5):**
- When host joins (`isOwner: true` in admitted message): backend sends `room-opened` event + sets room `status = 'open'` in DB if currently closed.
- OR: projcore may discover a different mechanism (check `rooms` table schema + signaling module for existing open/close logic).

**Room close + kick (R7):**
- New WS message type `close-room` (sent by host).
- Backend broadcasts `room-closed` to all participants → they disconnect.
- Backend sets room `status = 'closed'`.
- All existing guest connections drop.

**Gate:** `cd backend && npm run build` — 0 errors.

---

## B2 — Frontend: guest join flow (R1, R2, R3)

**New `/join` page:**
- Two fields: room code input + display name input.
- On submit: validate room exists via `GET /api/rooms/by-code/:code` (or similar lookup). If found → navigate to `/join/:slug`. If not found → "Room not found" inline error.

**`/join/:slug` guest overlay:**
- If user IS authenticated → proceed normally (existing flow).
- If user is NOT authenticated → show a name-collection overlay BEFORE entering the lobby. User enters display name → connects to WS as guest.
- Store guest identity in sessionStorage (name + ephemeral ID).

**Gate:** `ng build` 0 errors. Navigate to `/join` without login → see form. Enter valid room → see lobby.

---

## B3 — Frontend: host auto-open + leave modal (R5, R6, R7)

**Auto-open (R5):**
- In `room.page.ts` admitted handler: if `msg.isOwner === true` AND room is closed → send `open-room` WS message (or call REST endpoint).
- Room page reflects open/close state via a WS event or initial room state in the admitted payload.

**Leave modal (R6):**
- Replace direct leave action with a modal:
  ```
  "What would you like to do?"
  [Leave]          [Close room for everyone]
  ```
- "Leave" → existing leave flow.
- "Close room" → sends `close-room` WS message → await `room-closed` broadcast → then navigate away.

**Gate:** `ng build` 0 errors. Leave modal appears when host clicks Leave.

---

## B4 — UI: home/rooms list redesign (R8)

**Design direction (Google Meet):**
- Light background (`#f8f9fa` or white)
- Room cards: white card with subtle shadow, room name in bold, status chip (open/closed), code displayed, two CTAs: "Start" (if host) and "Copy link"
- Header: "Your rooms" title + "New room" primary button (top right)
- Guest entry point: subtle banner or link at top/bottom: "Join a meeting → Enter a code"
- No dense lists — cards with breathing room

**Gate:** `ng build` 0 errors. DEV: rooms list looks clean, cards readable.

---

## B5 — UI: pre-join/lobby screen redesign (R9)

**Design direction (Google Meet pre-join):**
- Full-width centered layout
- Left: camera preview (rounded, prominent)
- Right: room name, user name, mic/camera toggles, device selector dropdowns, "Join now" primary button
- Mobile: stacked layout
- Background: soft neutral (#f8f9fa)

**Gate:** `ng build` 0 errors. DEV: pre-join screen looks polished.

---

## B6 — UI: waiting room/admit screen redesign (R10)

**Design direction:**
- Header: "Waiting to join" badge count
- Guest cards: avatar circle (initials + color), display name, "Admit" (primary) / "Deny" (secondary) buttons
- Empty state: "No one is waiting" with icon
- Subtle animations on card entry

**Gate:** `ng build` 0 errors. DEV: admit screen shows guest cards cleanly.

---

## B7 — UI: room settings redesign (R11)

**Design direction:**
- Card sections: Room Info (name + code + copy button), Status (open/close toggle), Danger Zone (delete room button)
- Clean typography, good spacing
- Copy code: single click, "Copied!" toast

**Gate:** `ng build` 0 errors. Copy button works, toggle functional.

---

## B8 — Build + deploy + DEV smoke (ALL)

1. `cd frontend && npm run build` — production build, 0 errors
2. `pm2 restart meet-poc-fe`
3. Manual smoke by JROM:
   - Guest join flow: navigate to `/join`, enter code + name → lobby → admit → call
   - Host leave modal: host leaves → modal appears with both options
   - UI: all 4 screens match Google Meet aesthetic

---

## Dependencies
- B1 (backend) must complete before B2 (guest WS connect) and B3 (room-close broadcast)
- B4–B7 (UI) are independent of each other but each depends on B1/B2 base routes existing
- B8 requires B1–B7 all complete
