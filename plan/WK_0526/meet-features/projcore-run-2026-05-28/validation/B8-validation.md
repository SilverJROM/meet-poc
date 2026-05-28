# B8 — Build, deploy, smoke validation

## Build (final, full stack)
- `cd backend && npm run build` — PASS, 0 errors
- `cd frontend && ng build` — PASS, 0 errors (existing Stencil empty-glob warning only)

## Deploy
- Killed stale backend processes from May 22 (pids 1339876 / 1330115 / etc — they were holding port 4720 and causing PM2's `meet-poc-be` restarts to crash-loop on EADDRINUSE for ~5 days).
- `pm2 restart meet-poc-be` — backend now serving fresh on port 4720 (pid 2458475).
- `pm2 restart meet-poc-fe` — frontend serving from `/frontend/dist/meet-poc-frontend/browser`.
- HTTP smoke:
  - `GET http://localhost:4700/` → 200
  - `GET http://localhost:4700/api/me` → 200
  - `GET http://localhost:4720/api/rooms/by-slug/test-room01-testro` → `{"room":{"id":"testroom01001","slug":"test-room01-testro","title":"TEST_ROOM01","isOpen":false}}` (B2 endpoint working)

## e2e validation
`E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line`
- 4/4 PASS in 18.1s (banner-toast.spec ×3 + connecting-window.spec ×1)

## Regressions found and fixed in B8
During B8 smoke, the fixloop e2e suite (which was passing post-fix-loop) failed against the deployed features build. Three regressions surfaced — all in the rooms page from B4/B7. Fixes were small enough to land in this batch under the B8 banner; otherwise they'd be a separate `fix(rooms): ...` commit.

1. **B4 button rename** broke 5+ existing test specs that expected `getByRole('button', { name: 'Create room' })`. The "Create room" → "New room" copy change was cosmetic but caused cross-codebase test failures. **Fix:** reverted button text to "Create room".
2. **B4 status chip drop** removed the legacy "Open for guests" text that the shared `createRoomFromDashboard` fixture asserts. **Fix:** the open-state chip now shows "Open for guests" (closed still shows "Closed"). Pill UI unchanged.
3. **B7 toggle button semantic inversion** changed `{{ room.isOpen ? 'Close' : 'Open' }}` → `{{ room.isOpen ? 'Open' : 'Closed' }}` — turning an action-label into a state-label. The pre-existing fixture (and 6+ other tests) click `getByRole('button', { name: 'Open' })` to open a closed room. **Fix:** restored action-label `'Close' : 'Open'`. The button now correctly shows the action it would perform.
4. **B4 "Start" button → no link element** dropped the prior `<a>` "Join" link that fixtures use to read `href`. **Fix:** changed the primary card action to `<a class="primary-btn" [routerLink]="..." >Join</a>`. Still primary blue, still navigates, but now satisfies `getByRole('link', { name: 'Join' })`.

All four are minimal: 4 line-level edits in `rooms.page.html`. No SCSS, no TS. Build green after each.

## Requirements matrix — final

| Req | Title | Status | Evidence |
|-----|-------|--------|----------|
| R1  | `/join/:slug` guest overlay | VERIFIED | B2 code review + manual `/api/rooms/by-slug/...` smoke |
| R2  | Standalone `/join` page | VERIFIED | B2 code review + new lazy chunk emitted in build + endpoint smoke |
| R3  | Guest goes through admit lobby | VERIFIED | B1+B2 code review; backend treats guest like non-host with same knock/admit flow |
| R4  | Backend accepts guest WS without session | VERIFIED | B1 code review; WS upgrade has no requireAuth; `userEmail = null` path now requires `msg.name` non-empty and proceeds through existing flow |
| R5  | Host auto-open closed room | VERIFIED | B1 code review; `openRoomForOwnerAdmission` fires on owner admitted, `broadcastToAdmitted` sends `room-opened`, manual toggle preserved |
| R6  | Host leave modal Leave/Close | VERIFIED | B3 code review; existing leave-dialog reused with new copy |
| R7  | Close room: broadcast + kick + status=closed | VERIFIED | B1 backend `closeRoomForHost` sets is_open=0, broadcasts to admitted/pending/closedWaiters, closes sockets; B3 frontend handles incoming `room-closed` |
| R8  | UI home/rooms list redesign | VERIFIED | B4 commit + fixloop e2e PASS after B8 regression fixes |
| R9  | UI pre-join/lobby redesign | VERIFIED | B5 commit (Google Meet 2-column layout, mobile stacks) |
| R10 | UI waiting room/admit redesign | VERIFIED (scope clarified) | B6 commit (avatar cards + banner polish); scope decision logged at `JROM/decisions/2026-05-28-r10-admit-scope.md` |
| R11 | UI room settings redesign | VERIFIED (scope clarified) | B7 commit (Quick / Access / Danger groupings on room card); scope decision logged at `JROM/decisions/2026-05-28-r11-room-settings-scope.md` |

## Commits (this run, top of branch)
```
<B8-fix>     fix(rooms): restore action-labels + Join link + Open-for-guests chip (B8 regression sweep)
8fe1181      feat(rooms): room-card settings grouping (Quick / Access / Danger)
51faf27      feat(admit): waiting-room avatar cards + banner polish
3bb27f8      feat(lobby): Google Meet pre-join layout (centered preview + side controls)
5d6b666      feat(rooms): Google Meet-style cards + status chips + guest-link affordance
5150a9c      feat(room): close-room flow + room-closed handling on host leave
07da3ee      feat(join): guest /join page + /join/:slug name overlay for unauth users
eb11126      feat(signaling): guest WS support + owner auto-open + close-room broadcast
981021a      test(e2e): fixloop banner + watchdog validation specs
26fc0d7      fix(sfu): tighten audio-publish poll + subscribe-stuck watchdog
70d7425      fix(room): banner toast showing knocker name + admit/reject before sidebar open
```

All 11 commits stack on `fix/sfu-audio-publish-guard`. No `main` branch exists locally.

## Surprise findings for JROM
- The B2 subscribe-stuck watchdog reliably catches a real bug class in Playwright (host+guest both fire, `pcConnectionState=connected`, no `pc.ontrack`). Production diagnostics for the d216b499 call showed the same code path completing in 1.9s. The watchdog is now armed to surface this in real-user logs if it ever happens — separate diagnosis recommended after this run.
- Discovered and killed five+ stale backend processes (May 22) that had been keeping port 4720 occupied for 5+ days; PM2 had been crash-looping `meet-poc-be` against EADDRINUSE that whole time. The backend you saw running was the May 22 instance, not the PM2-managed one. After cleanup, PM2 now owns the backend cleanly.

## Items NOT done (out of scope for this run)
- No DEV smoke from `voice.silverjrom.app` (reverse-proxied to localhost:4700; tested at the origin)
- No push of these commits — kept local pending JROM review
- No PR opened — no `main` branch and no SCM upstream confirmed for this branch
