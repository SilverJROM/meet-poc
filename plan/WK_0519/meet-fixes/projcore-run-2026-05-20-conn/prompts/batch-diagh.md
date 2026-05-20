Batch-DIAGH: Room-name search on the rooms list (DR-23)

Batch ID: diagh
Requirement: DR-23 (full text in og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → code). Append `[projcore callback] diagh <STATE> <note>` to callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE:** never leave MEET_DB_PATH/MEET_RECORDINGS_DIR exported on a live pm2 restart; clean `pm2 start ecosystem.config.js`; verify no /tmp leak.

## DR-23 — Room-name search/filter

JROM: "add a search and for room name as well on the list." Add a search input on the rooms list page that filters displayed rooms by name (case-insensitive substring). Empty query = all rooms. Works with DR-14 clickable rows + DR-15 slugs. Client-side filter if the list is fully loaded; if the rooms list is paginated/server-fetched, do server-side filtering (a `?q=` query param) so it searches ALL rooms, not just the current page.

## Observed (confirm by reading)

- `frontend/src/app/pages/rooms/rooms.page.{ts,html}` — the rooms list + how rooms are fetched (paginated?). Add the search input + filter.
- `frontend/src/app/services/rooms.service.ts` — list fetch (add q param if server-side).
- `backend/src/modules/rooms/index.ts` + `store.ts` — GET /api/rooms; add name filter (q param) if server-side. (Rooms list IS paginated per earlier observation — server-side `q` is preferred so search spans all pages.)

## Scope

- DR-23 only. Small rooms-list feature.
- Do NOT regress DR-14 (clickable rows), DR-15 (slugs), DR-16 (open/close controls on the list), or pagination.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: client-side-vs-server-side decision (and why — is the list paginated?), the search input UI, the filter mechanism, planned files. Append callback. Wait for APPROVED-PLAN.

## Tests

- Playwright: type a query → list filters to matching room names; clear → all return. If server-side: assert it finds a room NOT on the first page.
- Backend (if server-side): GET /api/rooms?q=<term> returns only name-matching rooms.

## Required artifacts at plan/.../batch-diagh/

changes.md, scenarios.md, review.md, test-report.md, screenshots/rooms-search.png, independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

Backend+frontend build PASS; tests PASS; new e2e PASS; gate PASS on clean DB; pm2 restart clean (verify no leak); clean up test rooms.

## Completion

COMMIT BEFORE STATUS: DONE + append the diagh DONE callback.
