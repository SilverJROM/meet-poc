# context-handoff.md — meet-poc v2 Run 1

---

## Pre-B3 handoff (post-B2 PASS — backend layer complete)

**HEAD:** `feat/meet-v2-b2-host-authority` (commit `758bc5f docs: append v2 batch 2 callback`)
**Branch for B3:** `feat/meet-v2-b3-app-shell` — off the B2 HEAD.

**Backend state (no further BE changes in B3-B8):**
- 5 modules: auth, rooms, signaling, recording, sessions. 16 vitest / 39 tests green.
- `/api/meeting-sessions?status=&page=&pageSize=` ready for B4 to consume
- `/upload` auth-gated + session-bound; filename embeds sessionId UUID
- WS protocol full: recording-state, recording-started/stopped, meeting-ended-by-host, meeting-ended, mute-target, mute-request, remove-peer, peer-removed

**Frontend state (pre-v2):**
- Angular 20 SPA: login, single `/dashboard`, `/room/:id`
- Auth guard on `/dashboard`. Login redirects to `/dashboard`. noAuthGuard on `/login`
- Live at voice.silverjrom.app via PM2 NODE_ENV=production (serves built dist/)

**What B3 must produce:**
- New `pages/app-shell/` layout component with collapsible left sidebar + topbar + `<router-outlet>`
- `app.routes.ts` refactor: `/app` parent with 6 children (rooms, ongoing, past, recordings, transcripts, settings); `/dashboard` redirects to `/app/rooms`
- Migrate existing dashboard content to `/app/rooms` (no pagination yet — B4)
- Promote recordings section to `/app/recordings`
- Stub pages for Ongoing + Past (B4 wires content), Transcripts + Settings (Run 2)
- Move `authGuard` to `/app` parent
- Default sidebar collapsed; remember via localStorage
- Rebuild + `pm2 restart meet-poc-fe` to land on voice.silverjrom.app

**B3 does NOT do (deferred to B4):**
- Rooms pagination, Ongoing 5s poll, Past list, `?page=` URL persistence

**Standing flags:**
- Commit BEFORE STATUS: DONE
- §1.15 decisions/2026-05-19-v2-b3-<slug>.md for non-trivial calls
- §2.10 Playwright real-DOM
- Hygiene: test cleanup

**Decisions locked:**
- /app/* refactor (not extend /dashboard)
- Transcripts + Settings as VISIBLE stubs (not hidden) so sidebar is shape-complete
- Sidebar collapsed by default; localStorage memory

**Live service:** PM2 NODE_ENV=production. Codex MAY `pm2 restart meet-poc-fe` once after `npm run build -w frontend` to land on voice.silverjrom.app (autonomous-OK; new entry only, no legacy touch).

**Active callback target:** `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/callbacks.md` + `progress.md`.
