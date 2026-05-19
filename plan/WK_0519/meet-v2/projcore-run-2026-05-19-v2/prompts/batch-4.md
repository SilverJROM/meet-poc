# Batch v2-B4 — Frontend: tabs + pagination

**Persona switch:** Invoke `$lead`. /projcore supervises.

**Batch ID:** v2-B4
**Branch:** `feat/meet-v2-b4-tabs-pagination` — off the B3 HEAD.

**Requirements assigned:**
- **R4.1** — Rooms tab paginated; `/api/rooms?page=&pageSize=` backward-compat
- **R4.2** — Ongoing tab polls active sessions every 5s
- **R4.3** — Past tab paginated with duration formatting
- **R4.4** — Recordings tab promoted (B3 did the route; B4 adds pagination)
- **R4.5** — Create-room form remains on Rooms tab (B3 already did this — verify regression)
- **R4.6** — All paginated tabs persist `?page=` in URL

Read before coding:
- `og-requirements.md` (R4 section)
- `scenarios.md` (S4.1-S4.5)
- `context-handoff.md` (post-B3 state + recordings-count strategies)
- Existing services: `frontend/src/app/services/{rooms,recordings}.service.ts`
- Existing backend: `backend/src/modules/{rooms,recording,sessions}/index.ts`

---

## Expected (acceptance criteria)

### Backend — pagination + recordings count

**`backend/src/modules/rooms/index.ts`** — extend `GET /api/rooms`:
- Accept optional `?page=&pageSize=` query params.
- If neither param: return legacy `{rooms}` shape (backward-compat for any external caller).
- If either present: validate `page >= 1` (default 1), `pageSize` 1-100 (default 20). Return `{rooms, page, pageSize, total}`.
- Use parameterized `LIMIT/OFFSET` against the existing `owner_email`-filtered query, plus a `COUNT(*)` for total.

**`backend/src/modules/recording/index.ts`** — extend `GET /api/recordings`:
- Same backward-compat pattern: no params = legacy `{recordings}` shape, with params = paginated.
- Total = count of files matching the user's owned rooms after filename-parse filter.

**`backend/src/modules/sessions/store.ts`** + `index.ts` — extend the **ended** sessions query to include `recordings_count` per row:
- SQL: `LEFT JOIN` on recordings would require recordings to be in DB; they're not (filesystem-only). Instead, scan `recordings/` directory once per request, parse each filename, group by sessionId, then the SQL query JOINs with that in-memory map (or just iterate sessions and count matching files for each session).
- For 50-100 sessions this is fine. For 10000 sessions you'd need an index — flag in caveats.
- Add `recordingsCount: number` to the API response for ended sessions.

### Frontend — pagination + ongoing + past

**Shared pagination component** `frontend/src/app/components/pagination/pagination.component.{ts,html,scss}`:
- Props: `page` (current), `total`, `pageSize`. Outputs: `pageChange`.
- Renders: "Page N of M" + Prev + Next buttons. Prev disabled on page 1; Next disabled on last page.
- Mobile-friendly minimum touch target sizes (48px ish — already future-proofing for Run 3).

**Rooms page** `pages/rooms/`:
- Extend `RoomsService.list({page, pageSize})` to accept params and return `{rooms, page, pageSize, total}`.
- Use `ActivatedRoute.queryParams` + `Router.navigate(['./', {queryParams: {page: N}}])` to keep `?page=N` in sync with state.
- Page size 20 default. On page change, scroll-to-top of list.
- Create-room form behavior unchanged.

**Recordings page** `pages/recordings/`:
- Same pagination pattern. Same shared `<app-pagination>` component.

**Ongoing page** `pages/ongoing/ongoing.page.{ts,html,scss}` (replace `ongoing-stub`):
- `MeetingSessionsService.listActive(): Observable<{sessions, total}>` — call `GET /api/meeting-sessions?status=active`.
- Component uses signals + `effect()` to poll every 5s: `interval(5000).pipe(startWith(0))` triggers re-fetch.
- Render each active session:
  - Room title (link to `/room/<roomId>`)
  - "Started X minutes ago" relative time
  - "N participant(s)" via `admitted_peak`
  - Host email (small muted text)
  - "Join meeting" button
- Empty state: "No meetings in progress."
- Cleanup the poll on `ngOnDestroy` / signal destroy.

**Past page** `pages/past/past.page.{ts,html,scss}` (replace `past-stub`):
- `MeetingSessionsService.listEnded({page, pageSize}): Observable<{sessions, page, pageSize, total}>`.
- Render columns: Room title (no link — meeting is over), Started (full timestamp via Angular's `DatePipe 'medium'`), Duration formatted (`mm:ss` under 60min, `h:mm:ss` over), Participants (admitted_peak), Recordings (count, with link to `/app/recordings?session=<sessionId>` if count > 0 — bonus polish).
- Paginated. URL `?page=N`.

**`MeetingSessionsService`** new file `frontend/src/app/services/meeting-sessions.service.ts`:
- `listActive()` → `GET /api/meeting-sessions?status=active`
- `listEnded({page, pageSize})` → `GET /api/meeting-sessions?status=ended&page=&pageSize=`

### Tests

**Backend** — extend existing test files (no new files needed):
- `rooms.test.ts` — add pagination paths: seed 25 rooms, `GET /api/rooms?page=1&pageSize=20` returns 20 + total=25; legacy `GET /api/rooms` (no params) still returns full list shape `{rooms}`.
- `recording.test.ts` — same pattern for paginated recordings listing.
- `sessions-api.test.ts` — verify `recordingsCount` per ended session row (seed 1 ended session + 2 recordings matching its sessionId in filename + verify count=2 in response).

**E2E** `e2e/tests/v2-b4-tabs/`:
- `rooms-pagination.spec.ts` — S4.1: seed 25 rooms via API, visit `/app/rooms`, page 1 shows 20 + "Page 1 of 2" + Next enabled; click Next → URL becomes `?page=2`, shows 5 + Prev enabled. **Clean up** seeded rooms after.
- `create-room.spec.ts` — S4.2 (R4.5): create a room via the form, it appears in the list.
- `ongoing-tab.spec.ts` — S4.3: insert an active session via direct SQLite write, visit `/app/ongoing`, row visible. Insert a 2nd → within ~6s, both visible (poll pickup). Clean sessions.
- `past-tab.spec.ts` — S4.4: insert 2 eligible ended sessions (admitted_peak=2, duration=60s), visit `/app/past`, both rows visible with formatted duration. Clean.
- `recordings-tab.spec.ts` — S4.5: pre-seed recording file (with valid new-shape filename) + matching session, visit `/app/recordings`, row visible with Download link. Clean.

**Hygiene** — every test that inserts a row or file must remove it in `afterEach`/`afterAll`. Test-only direct-SQLite writes are allowed if necessary, but must be cleaned.

### Build + deploy

```
npm run build -w frontend
pm2 restart meet-poc-fe
```

Verify https://voice.silverjrom.app/app/rooms, /ongoing, /past, /recordings all render the new content (not stubs).

## Required artifacts

`projcore-run-2026-05-19-v2/batch-4/`:
1. `changes.md` — full template + backend pagination shape table + recordings-count strategy choice + URL persistence note
2. `scenarios-implemented.md` — S4.1-S4.5
3. `test-report.md` — backend regression + B3 regression + B4 targeted
4. `review.md`
5. `independent-validation.md`
6. `screenshots/` — `/app/rooms?page=1`, `/app/rooms?page=2`, `/app/ongoing` (empty + populated), `/app/past` with rows, `/app/recordings`
7. **Decisions:** `decisions/2026-05-19-v2-b4-<slug>.md` for recordings-count strategy + any pagination edge-cases (page > total, etc.)

## Scope (hard limits)

- **DO** items in Expected.
- **DO NOT** modify the room call UI (`/room/:id`) — B5/B6/B7/B8.
- **DO NOT** touch Transcripts or Settings stubs.
- **DO NOT** add new WS messages.
- **DO NOT** modify auth, recording auth, or signaling.

## Completion protocol

Commit BEFORE STATUS: DONE.

```
STATUS: DONE — v2-B4 tabs + pagination + 5 scenarios green + live verified at voice.silverjrom.app
```

— /projcore (Claude, Opus, 2026-05-19)
