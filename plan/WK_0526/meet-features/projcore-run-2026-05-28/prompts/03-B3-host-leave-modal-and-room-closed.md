# B3 — Host leave modal + frontend room-closed handling (R6, R7)

**Consultation outcome:** items 7 & 8 are locked in. Extend the existing `app-leave-dialog`; B3 does NOT own auto-open (B1 did).

## Scope

### Part 1 — Update leave-dialog copy + outputs (R6)

File: `frontend/src/app/components/leave-dialog/leave-dialog.component.{html,ts}`

- Change the button copy:
  - "End meeting for everyone" → **"Close room"**
  - "Leave but keep meeting going" → **"Leave"**
- The output names stay (`endForAll`, `justLeave`, `cancel`) — only template copy and (in the `.ts`) the visible JSDoc/comment should reflect new semantics. Don't rename outputs (consumers in `room.page.ts` would need to be touched too — keep it surgical).
- The heading "Leave meeting" can stay; the body "You're the host. What would you like to do?" can stay or be updated to "What would you like to do?" — implementer choice.

### Part 2 — Update `endForAll()` to send `close-room` (R7)

File: `frontend/src/app/pages/room/room.page.ts`

In the `async endForAll()` method (line 858–875):
- Replace the line `this.ws.send({ type: 'meeting-ended-by-host' });` with `this.ws.send({ type: 'close-room' });`
- Keep the recorder flush logic intact (record-then-close is still valid).
- After sending, the backend will broadcast `room-closed` to everyone (including the sender) and close the sockets. The recorder-flush + 1s delay is still useful to ensure the upload completes before the backend severs the WS.

### Part 3 — Handle incoming `room-closed` (R7)

File: `frontend/src/app/pages/room/room.page.ts`

In the `handleMessage` dispatcher (around line 866), add a handler for `msg.type === 'room-closed'`:
- If the local user is the host (the one who initiated close-room): just teardown locally (we already initiated, no need for a toast).
- If the local user is a non-host admitted participant: show a brief notification "Room has been closed by the host." (use the existing `meetingEndedToastOpen` mechanism if it cleanly fits, OR a new short-lived `actionNotice`). Then `directLeave(false)`.
- If the local user is a pending knocker (state='knocking') or in `waiting-room`: show "Room has been closed." and route to home/lobby. Use the same `directLeave(false)` flow (it already handles these states).
- Stop the diagnostics logger; clean up the WS (backend will close it but be defensive).

Implementer choice: reuse `meeting-ended-by-host` notification UI if it works for `room-closed` (just call the same toast with a different message string), OR add a new small toast. Keep it simple — one commit, no new component.

### Part 4 — Reject auto-open in B3 (negative guard)

B3 does NOT change the auto-open flow. B1 handles host auto-open server-side. If you see any auto-open logic in `room.page.ts`, leave it alone.

## Hard constraints

- Files allowed:
  - `frontend/src/app/components/leave-dialog/leave-dialog.component.html`
  - `frontend/src/app/components/leave-dialog/leave-dialog.component.ts` (only if you need to update the JSDoc / button semantics)
  - `frontend/src/app/pages/room/room.page.ts` (endForAll edit + room-closed handler)
  - `frontend/src/app/pages/room/room.page.html` (ONLY if `room-closed` reuses or adds a tiny toast — otherwise leave untouched)
- DO NOT touch backend, ws.service.ts (the `room-closed` type was added in B1 already), signaling, or any in-call surface.
- DO NOT remove the `meeting-ended-by-host` outgoing message type from the WS union — it stays for backward compat / other paths.
- DO NOT add new dependencies, components, or outputs.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors (no backend changes expected, but build must stay clean).
2. `cd frontend && ng build` — 0 errors.
3. Manual code review: confirm copy change in leave-dialog, `close-room` outgoing message, `room-closed` incoming handler. Confirm no auto-open logic added.
4. Write `validation/B3-changes.md`.
5. Commit: `feat(room): close-room flow + room-closed handling on host leave`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B3-blocker.md`, do NOT push.
- If reusing `meeting-ended-by-host` toast for `room-closed` would actually conflict with the `meeting-ended` flow (e.g., dual toasts on host's own browser), STOP and report — DO NOT refactor the toast system.

Final line MUST be: `STATUS: DONE — B3 ready for validation`.
