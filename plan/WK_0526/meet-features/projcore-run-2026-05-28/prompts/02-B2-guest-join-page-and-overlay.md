# B2 — Frontend: guest `/join` page + `/join/:slug` overlay (R1, R2, R3)

**Consultation outcome:** items 5 & 6 are locked in. Plus a small backend addition listed below (a public room-by-slug lookup) is permitted in this batch since it's only ~10 lines and is needed for R2.

## Scope

### Part 1 — Public room lookup endpoint (small backend addition for R2)

File: `backend/src/modules/rooms/index.ts`

Add a new PUBLIC (no `auth` middleware) endpoint that lets the standalone `/join` page resolve a room code:

```ts
router.get('/rooms/by-slug/:slug', (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!slug) { res.status(404).json({ error: 'not found' }); return; }
  const room = getRoomBySlugOrId(slug);  // re-uses existing helper
  if (!room) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ room: { id: room.id, slug: room.slug, title: room.title, isOpen: room.isOpen } });
});
```

- DO NOT leak `ownerEmail`, `waitTimeoutMinutes`, or any other field beyond `id, slug, title, isOpen`. That's a privacy/security minimum.
- DO NOT add auth — this is intentionally public so unauth guests can resolve room codes.

### Part 2 — Standalone `/join` page (R2)

Files (new): `frontend/src/app/pages/join/join.page.ts`, `join.page.html`, `join.page.scss`.
File (edit): `frontend/src/app/app.routes.ts` — add `{ path: 'join', loadComponent: () => import('./pages/join/join.page').then(m => m.JoinPage) }` BEFORE `{ path: 'join/:slug', ... }`.

Page behavior:
- Two inputs: **Room code** (text) + **Your name** (text). Submit button "Continue".
- On submit:
  1. Trim both fields. If either empty → inline error "Room code and name are required."
  2. `GET /api/rooms/by-slug/{trimmedCode}` via `HttpClient`. If 404 → "Room not found." inline error.
  3. If found: stash guest name in `sessionStorage` (key: `guestDisplayName`), navigate to `/join/{slug}`.
- Simple Google-Meet-styled centered card. Use existing typography/colors. No backend changes beyond Part 1.

### Part 3 — `/join/:slug` guest overlay (R1, R3)

File: `frontend/src/app/pages/room/room.page.ts`, `room.page.html`, `room.page.scss`.

Behavior:
- Detect the route is `/join/:slug` (NOT `/room/:slug`) via the existing `ActivatedRoute` injection. `room.page.ts` is registered on both routes; you can read `route.url` or inject a `data: { joinMode: true }` route data field — implementer choice.
- On page load, call `AuthService.checkSession()`. If `auth.user() === null`:
  - Show a **guest overlay** instead of the normal lobby preflight. Overlay = full-screen modal-like panel with:
    - Room title (resolve via `GET /api/rooms/by-slug/{slug}`)
    - One input: "Your name" (pre-fill from `sessionStorage.getItem('guestDisplayName')` if present)
    - Continue button → sets the displayed name, persists to sessionStorage, dismisses overlay
  - After overlay dismissed: continue with the existing lobby preflight flow. The WS `join` will use the guest name; backend B1 will accept it (no auth cookie required).
- If `auth.user() !== null` (authenticated user accessing `/join/:slug` by direct link): skip the overlay, proceed with existing flow.
- R3 acceptance: the guest goes through the same knock/admit lobby as registered users (no changes needed — backend already handles this).

## Hard constraints

- Files allowed:
  - `backend/src/modules/rooms/index.ts` (the ~10-line public route)
  - `frontend/src/app/app.routes.ts` (one new lazy route)
  - NEW: `frontend/src/app/pages/join/{join.page.ts, join.page.html, join.page.scss}`
  - `frontend/src/app/pages/room/room.page.ts`, `room.page.html`, `room.page.scss` (guest overlay block + scss only — keep existing logic intact)
- DO NOT touch: signaling, ws.service.ts, sfu-client.service.ts, any in-call surface (controls-bar, tile, chat, sidebar, leave-dialog).
- DO NOT add any new ws message types. Backend B1 already wired what's needed.
- The guest overlay MUST gate the lobby preflight (no mic/camera prompt until the user submits a name). Otherwise unauth users would trigger media access prompts before identifying themselves.

## Acceptance gate (you do these before reporting DONE)

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. Manual code review: confirm guest overlay only appears on `/join/:slug` when unauth; standalone `/join` validates via the new endpoint; no in-call UI touched.
4. Write `plan/WK_0526/meet-features/projcore-run-2026-05-28/validation/B2-changes.md`: files touched, what each does, plus a paragraph on how the auth-check + overlay short-circuits the lobby preflight.
5. Commit: `feat(join): guest /join page + /join/:slug name overlay for unauth users`. One commit.

## Stop conditions

- 3× build failure → STOP, write `validation/B2-blocker.md`, do NOT push.
- If the existing room page architecture makes the overlay impossible without restructuring (e.g., lobby preflight runs in ngOnInit and can't be gated), STOP and report. Don't refactor RoomPage — that's a separate concern.

Final line MUST be: `STATUS: DONE — B2 ready for validation`.
