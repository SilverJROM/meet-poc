# Consultation agreements — locked

**Source:** codex consultation reply 2026-05-28, in response to `prompts/00-consultation.md`. Claude AGREED on all 11 items.

## B1 — Backend

| # | Change | Why |
|---|--------|-----|
| 1 | No WS auth bypass. WS upgrade has no `requireAuth`; it reads cookie opportunistically and reaches `join` with `userEmail = null` when unauth. Add guest-token validation INSIDE the `join` message handler instead. | Original plan's premise was wrong. There is no middleware to bypass. |
| 2 | Backend-driven auto-open on owner admit/join. NOT frontend-triggered. | Backend owns `room.isOpen` authority; frontend trigger creates a race. R5 must be state-authoritative. |
| 3 | Add owner-safe helper in `rooms/store.ts` to set room access without requiring a REST owner-email param. | Existing `setRoomAccess` is REST-shaped; signaling needs to set state from trusted backend logic. |
| 4 | Add a distinct `room-closed` handling path: kicks admitted + pending + closedWaiters AND sets `is_open = 0`. Don't reuse `meeting-ended-by-host`. | Existing path doesn't set status closed and doesn't handle closedWaiters. R7 requires both. |

## B2 — Guest entry

| # | Change | Why |
|---|--------|-----|
| 5 | `/join` is a NEW lazy-loaded page. `/join/:slug` stays on `RoomPage` with route-mode guest overlay. | Standalone code+name entry is a different screen from the media preflight room page. |
| 6 | Use `AuthService.checkSession()` in `RoomPage` to detect unauthenticated `/join/:slug`, then require guest name/token BEFORE media preflight/join. | Today unauth users render lobby with blank name and can attempt join — bug. Route-mode-driven overlay fixes that. |

## B3 — Host leave modal

| # | Change | Why |
|---|--------|-----|
| 7 | Extend the existing `app-leave-dialog`. Do NOT add a second modal. Update copy/actions from "End meeting for everyone" → "Close room" + add a new `close-room` WS path. | Modal already exists and is wired from `RoomPage.leave()`. Smaller diff. |
| 8 | B3 owns frontend room-closed reaction + leave-modal wiring. Does NOT own auto-open. | Auto-open belongs in B1 backend; splitting across B1+B3 would duplicate behavior. |

## B6 — Admit screen scope clarification

| # | Change | Why |
|---|--------|-----|
| 9 | Clarify R10 target before implementation. Current host admit UI lives in in-call surfaces; north-star says in-call UI is OUT. **Decision (Claude, JROM away):** R10 = the participant-sidebar "Waiting to join" section + the fix-loop knock-banner-toast styling polish. The call-panel/tiles/controls-bar/chat remain untouched. Logged to JROM decisions. | Without this clarification, B6 would conflict with the scope boundary. |

## B8 — Test gate

| # | Change | Why |
|---|--------|-----|
| 10 | B8 gate includes `cd backend && npm run build`, not just frontend + pm2. | North-star D9 already mandates backend build; plan was missing it. |

## Branch / commits

| # | Change | Why |
|---|--------|-----|
| 11 | Keep stacking on `fix/sfu-audio-publish-guard`. There is no local `main`; `master` exists but is not the active branch. One commit per batch. | Fix-loop commits already stack here. |
