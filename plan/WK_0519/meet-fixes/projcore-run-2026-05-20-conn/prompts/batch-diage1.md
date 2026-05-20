Batch-DIAGE1: Clickable rooms (DR-14) + name-based/custom room URLs (DR-15)

Batch ID: diage1
Requirements: DR-14, DR-15 (full text in plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (STATUS: PROPOSED → wait for APPROVED-PLAN → code). Final action of every STATUS reply: append `[projcore callback] diage1 <STATE> <note>` to the run callbacks.md. End every reply with `STATUS: <verb> — <reason>`.

## DR-14 — Clickable room rows

JROM: "make the room clickable." In the rooms list, clicking a room row navigates into that room (the join flow / room URL) — not only via a separate button. Keep accessibility (role=button or anchor, keyboard Enter/Space). Existing per-row actions (delete, select checkbox, etc.) must NOT trigger navigation (stop propagation).

## DR-15 — Name-based room URLs + custom owner slug

JROM: "use the room name on the url link just add a random alphanum to make it unique ... if its me i can force name it ... as long as its unique" + ANY room owner can set a custom slug.

- Backend: add a unique `slug` column to rooms (migration, unique index). Auto-generate on room create: kebab-case the room name + a short random alphanum suffix (e.g. `weekly-sync-a1b2c3`). Ensure global uniqueness (regenerate suffix on collision).
- Any room OWNER can set a custom vanity slug for their own room via an endpoint (e.g. PUT /api/rooms/:id/slug): validate url-safe (lowercase alnum + hyphens) + globally unique; reject duplicates with a clear error.
- **Routing:** `/room/:slug` resolves the room by slug. **Keep `/room/:id` working** (resolve by slug OR id — try slug first, fall back to id) so existing links + the WS join flow don't break. Update the frontend room route + the rooms-list links to use the slug.
- The WS/signaling join uses the resolved room id internally; only the URL changes.

## Observed (confirm by reading)

- `backend/src/modules/rooms/store.ts` + `index.ts` — room schema, create, getRoom; add slug column + migration + lookup-by-slug-or-id + custom-slug endpoint.
- `backend/db/migrations/` — next migration number for the slug column (idempotent, backfill slugs for existing rooms from their titles).
- `frontend/src/app/app.routes.ts` — room route param (currently /room/:id; add slug resolution).
- `frontend/src/app/pages/rooms/rooms.page.{ts,html}` — room list rows (DR-14 clickable + use slug in links).
- `frontend/src/app/pages/room/room.page.ts` — resolves the route param to a room (handle slug or id).

## Scope

- DR-14 + DR-15 only.
- DO NOT touch DR-16 waiting-room logic (that's E2, next).
- DO NOT regress DR-1..DR-13 or the FIXC work.
- Migration must backfill slugs for the existing TEST_ROOM01 + any rooms without breaking them.
- Backward-compat: legacy /room/:id MUST still resolve.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: the slug column + migration + backfill approach, slug-generation + collision handling, the custom-slug endpoint + uniqueness validation, the resolve-by-slug-or-id strategy (and how the WS join maps slug→id), the clickable-row approach (without breaking row actions), planned files. Append callback. Wait for APPROVED-PLAN.

## Tests

- Backend: create room → slug auto-generated (name-kebab + suffix), unique; custom-slug set → unique enforced (duplicate rejected with clear error); getRoom resolves by slug AND by id; migration backfills existing rooms.
- Playwright: rooms list row click → navigates to /room/<slug>; row delete action does NOT navigate; visiting /room/<slug> opens the room; legacy /room/<id> still opens it.

## Required artifacts at plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diage1/

changes.md, scenarios.md, review.md, test-report.md, screenshots/{rooms-clickable.png, room-url-slug.png}, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- Backend + frontend build PASS; backend tests PASS; new e2e PASS; targeted Run-1 + diag specs PASS. **Validate on a clean/isolated DB** (the live DB's data-seed specs have a known cross-connection FK/WAL flake — don't let that mask real results). R8.1 must hold.
- Migration runs cleanly on the live DB (`data/meet-poc.sqlite`) — backfills slugs, TEST_ROOM01 keeps working.
- pm2 restart meet-poc-fe meet-poc-be.
- **Clean up any test rooms you create** (no dashboard pollution; keep TEST_ROOM01).

## Completion

COMMIT BEFORE STATUS: DONE. End with `STATUS: DONE — <reason>` + append `[projcore callback] diage1 DONE <note>` to callbacks.md.
