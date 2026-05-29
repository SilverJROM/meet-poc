# OG Requirements — Meet Features Run
**Created:** 2026-05-28  
**Source:** JROM frontloaded interview (2026-05-28)  
**Lifecycle:** pre-live (deferral OFF)

---

## Background

Three feature additions requested by JROM after the audio silence fix run. All three affect the HOST SIDE and the guest entry flow. In-call UI is explicitly OUT OF SCOPE.

---

## Requirements

### Feature 1 — Guest Join (non-registered users)

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R1 | The `/join/:slug` route MUST detect unauthenticated users and show a guest name input overlay (display name field + "Join" button) before proceeding. If slug is invalid or room does not exist → show a "Room not found" error. If room is closed → show "Room is not available." | Unauthenticated user navigates to `/join/abc123`, sees name form, submits name → enters lobby/waiting room. No login required. |
| R2 | A standalone `/join` page (no slug) MUST exist where unauthenticated users enter a room code + display name and are taken to the lobby for that room. This is the entry point for users who don't have a direct link. | User navigates to `/join`, enters room code + name → app validates room exists → takes user to `/join/:slug` guest flow. |
| R3 | A guest joining MUST go through the host-admit lobby (same as registered users). Guest appears in the host's admit queue with their chosen display name. Host clicks Admit → guest enters the call. | Guest waits in lobby; host sees them with display name; host admits → guest joins call. |
| R4 | Backend MUST accept guest connections on the signaling WebSocket with a short-lived guest token (no user session cookie required). Guest identity: display name + ephemeral ID. Guest has the same in-call permissions as a registered non-host participant. | WS connects as guest; diagnostics show guest display name; guest can speak/video. |

### Feature 2 — Host Auto-Open + Leave Prompt

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R5 | When the host joins a room (receives `admitted` WS message with `isOwner: true` OR `isHost: true`), the room MUST automatically open (allow new guests to enter the lobby) if it is currently closed. The existing manual open/close toggle must still function. | Host joins closed room → room status flips to open automatically. Manual toggle still works. |
| R6 | When the host initiates leaving (clicks Leave or navigates away mid-call), the app MUST show a modal dialog with two options: "Leave" (host leaves, room stays open, others remain) and "Close room" (host leaves AND room closes AND all current participants are kicked/disconnected immediately). | Host clicks Leave → modal appears with both options. No accidental close. |
| R7 | Selecting "Close room" in the leave modal MUST: (1) send a broadcast WS event to all connected participants causing their clients to disconnect and show a "Room has been closed" message, (2) set room status to closed in the backend, (3) disconnect the host. | All participants see "Room closed by host" message and are returned to the home screen. |

### Feature 3 — UI Reimagine (host pre-call screens)

**Design direction:** Google Meet-inspired. Clean, airy, light background, clear primary actions, good typography. In-call UI is NOT in scope.

| ID | Requirement | Acceptance |
|----|-------------|------------|
| R8 | **Home / rooms list page** (`/app/rooms`): Redesign to feel modern and clean. Show rooms as cards with clear name, status (open/closed), and a prominent "Start" or "Join" CTA per card. Include a visible "Join as guest" / "Enter a code" entry point linking to `/join`. | Side-by-side comparison: current vs new. Cards readable, CTAs clear. |
| R9 | **Pre-join / lobby screen**: Redesign the screen where the host sets up before entering the call (camera/mic preview, name display, Join button). Layout: centered camera preview, device selectors beneath, prominent "Join now" button. Google Meet pre-join aesthetic. | Camera preview centered, device controls visible, join button prominent. |
| R10 | **Waiting room / admit screen**: Redesign the admit UI where host sees guests waiting. Modern card-per-guest layout with avatar initials, display name, and Admit/Deny buttons. Show count of waiting guests in a header badge. | Guest cards visible, admit/deny clearly labeled, count badge shown. |
| R11 | **Room settings / management page**: Redesign the room settings/detail UI. Must include: room name, room code (with copy button), open/close toggle, and a "Delete room" action. Clean card-based layout. | Settings readable, copy-code button works, open/close toggle visible and functional. |

---

## Out of scope for this run
- In-call UI (video tiles, controls bar, chat panel)
- Recording/transcript features
- User auth/registration flow changes
- Mobile-specific UI (existing mobile handling stays as-is)
- Backend room creation flow changes
