# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B4 handoff (post-B3 PASS)

**HEAD:** `feat/meet-v2-b3-app-shell` (`32912a8 docs: append v2 batch 3 callback`)
**Branch for B4:** `feat/meet-v2-b4-tabs-pagination` — off the B3 HEAD.

**Post-B3 state:**
- Backend: 5 modules, 16 vitest / 39 tests green. APIs ready: `/api/meeting-sessions?status=&page=&pageSize=`, `/upload` auth-bound.
- Frontend: `/app/*` shell with 6 tabs:
  - `/app/rooms` — create-room + room list (unpaginated)
  - `/app/ongoing` — STUB
  - `/app/past` — STUB
  - `/app/recordings` — list (unpaginated)
  - `/app/transcripts` + `/app/settings` — Run 2 stubs (untouched in B4)
- Live: voice.silverjrom.app serves the new shell.
- `RoomsService`/`RecordingsService` have only `list()` — extended for pagination in B4.
- No `MeetingSessionsService` yet — B4 creates it.

**What B4 must produce:**
- Backend `/api/rooms?page=&pageSize=` and `/api/recordings?page=&pageSize=` extended (backward-compat: no params = legacy shape).
- Backend `/api/meeting-sessions?status=ended` rows include `recordingsCount` (codex picks strategy: in-memory FS scan join is preferred).
- Frontend pagination component (shared) + Rooms tab pagination + Recordings tab pagination.
- Frontend Ongoing page (5s poll) + Past page (paginated, duration formatting).
- `MeetingSessionsService` new file with `listActive()` + `listEnded({page,pageSize})`.
- URL `?page=N` persistence on Rooms / Past / Recordings.
- Rebuild + `pm2 restart meet-poc-fe`.

**Standing flags:**
- Commit BEFORE STATUS: DONE
- §1.15 decisions for non-trivial calls (recordings-count strategy, edge cases like page > total)
- §2.10 real-DOM tests
- Hygiene: clean seeded rooms/sessions/recordings after each test

**Decisions locked:**
- Page size = 20 default
- 5s poll for Ongoing
- Backward-compat for /api/rooms + /api/recordings (no params = legacy)

**Live:** PM2 NODE_ENV=production. Rebuild + restart meet-poc-fe lands on voice.silverjrom.app.

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
