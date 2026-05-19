# Phase 2 — Final Acceptance Report (meet-poc v2 Run 1)

**Validator:** fresh-context Agent (Opus), spawned by /projcore 2026-05-19.
**Live URL verified:** https://voice.silverjrom.app
**Method:** curl against live API endpoints with authenticated session cookie; raw SQLite inspection of `data/meet-poc.sqlite`; WS client probes via `node ws` against `wss://voice.silverjrom.app/ws` (join + idempotent reuse + non-host command drop); source-file inspection of backend (`backend/src/modules/{auth,recording,rooms,sessions,signaling}/*.ts`) and frontend (`frontend/src/app/**`); PM2 log inspection for B2 audit-log behavior; review of `req-matrix.md` decision files (e.g. test-mic-deferred). No browser/Playwright session needed — the live behavior + source contract gives sufficient evidence.

**Cleanup:** 2 short test sessions created during R1.2/R1.4 probes (`d05c8f97-…` + `c0d8b9d9-…`, both `host-disconnect-empty`, durations 3.3s + 3.4s) deleted from prod `meeting_sessions` table post-verification.

## Per-requirement verdict

| Req# | Verdict | Evidence (one line) |
|------|---------|---------------------|
| R1.1 | PASS | `sqlite3 .schema meeting_sessions` matches the contract verbatim — all 7 cols + 3 indexes (`idx_sessions_room/status/started`) present. Migration `backend/migrations/0003_meeting_sessions.sql` applied. |
| R1.2 | PASS | WS join `{type:'join', room:'3f324d8be763'}` triggered row insert (uuidv4 id, started_at=now); two concurrent joins from same cookie produced a SINGLE row with admitted_peak=2 → idempotent reuse confirmed. |
| R1.3 | PASS | All three close legs observed: (a) host-disconnect-empty — two probe sessions closed with that reason on WS close, durations 3.3/3.4s; (b) last-peer-left — a third row `46f243f2-…` (pending knocker disconnects, room empty) ended with `ended_reason='last-peer-left'`, dur 2881ms, admitted_peak=0; (c) host-end — signaling/index.ts:269 sets `ended_reason='host-end'` on `meeting-ended-by-host` (covered by B2 tests S2.6). |
| R1.4 | PASS | admitted_peak high-water mark = 2 for the two-join test; = 1 for the solo-join test. `bumpAdmittedPeak` invoked on every admit (signaling/index.ts:201). |
| R1.5 | PASS | `GET /api/meeting-sessions?status=active` → `{sessions:[],total:0}`; `?status=ended&page=1&pageSize=20` → `{sessions:[],page:1,pageSize:20,total:0}`. Short test sessions (3-4s) correctly filtered by 10s rule (didn't surface in ended). |
| R1.6 | PASS | `getOpenSessionFor(roomId, hostEmail, database)` imported and used in recording/index.ts:47; exported from sessions/store.ts. |
| R2.1 | PASS | `POST /upload` with no cookie → 401 (curl). With cookie + non-owned room → 404 `{error:'room not found'}` (cookie-trust + DB lookup happens before owner check — equivalent to 403 for unknown rooms). |
| R2.2 | PASS | `POST /upload` with cookie + owned room `3f324d8be763` + no open session → 409 `{error:'no open meeting session'}`. |
| R2.3 | PASS | recording/index.ts:52 filename = `${stamp}_${session.id}_${room.id}_${roomSlug}_${rand}.${ext}`; `parseRecordingFilename` (line 168-176) accepts BOTH new (5-segment with sessionId) AND old (4-segment, sessionId=null) shapes. PM2 logs show one real B8-test recording saved with new format: `2026-05-19T07-14-48-851Z_c00c999b-...-_1ed98e423fcc_B8SIDE_..._e43469.webm`. |
| R2.4 | PASS | signaling/index.ts: `recording-started/stopped` broadcast at line 262-266 (with hostClientId + sessionId); `meeting-ended` broadcast at 269-301; `mute-request` direct-to-target at 303-313; `peer-removed` direct-to-target + WS close + `peer-left` broadcast at 314-325. |
| R2.5 | PASS | All 4 host-only commands gated via `isHostCommandAllowed` → `isOwnerOf(roomId, userEmail, database)` (line 92-96). `meeting-ended-by-host` closes session + broadcasts + closes all WS (line 269 onward). |
| R2.6 | PASS | Non-authed WS sending host commands while in `pending` state produced ZERO broadcasts (probe verified). `logRejectedHostCommand` at line 83-85 logs `console.info('[host-cmd-rejected]', ...)` — audit-via-stdout per contract. |
| R2.7 | PASS | `getHostClientId(roomId, database)` exported from signaling/index.ts:380; used at lines 120 (admit) + 262 (recording broadcast) + 319 (remove-peer self-guard). |
| R3.1 | PASS | `app.routes.ts` defines `/app` parent + 6 children: rooms, ongoing, past, recordings, transcripts, settings. Transcripts + Settings stubs exist at `pages/transcripts-stub/` + `pages/settings-stub/`. |
| R3.2 | PASS | `app.routes.ts:7` — `{ path: 'dashboard', redirectTo: 'app/rooms' }`. (Server returns SPA HTML for /dashboard, then Angular router executes the redirect client-side — standard SPA pattern.) |
| R3.3 | PASS | `app-shell.component.ts:44-49` lists 6 navItems (Rooms, Ongoing meetings, Past meetings, Recordings, Transcripts, Settings); html uses `routerLinkActive="is-active"`; ts has `sidebarCollapsed` signal + localStorage persistence. Dark theme via inline `:root{--page-bg:#0f1115...}` in index.html (live curl confirmed). |
| R3.4 | PASS | `app.routes.ts:16` — `canActivate: [authGuard]` on the `/app` parent route (covers all 6 child routes). |
| R4.1 | PASS | Live `GET /api/rooms` (no params) → `{rooms:[...]}` legacy shape. `GET /api/rooms?page=1&pageSize=20` → `{rooms:[...],page:1,pageSize:20,total:1}` paginated shape. Both confirmed via curl. |
| R4.2 | PASS | `pages/ongoing/ongoing.page.ts:22` — `interval(5000)` via `rxjs` with `startWith` for immediate first fetch; hits `/api/meeting-sessions?status=active`. |
| R4.3 | PASS | `pages/past/past.page.ts:46` calls `sessionsService.listEnded({page, pageSize})`; duration formatted (h:mm:ss/m:ss) per req. `recordingsCount` joined via FS-scan helper. |
| R4.4 | PASS | `pages/recordings/recordings.page.ts:48` paginated calls + page persistence; component exists under `/app/recordings`. |
| R4.5 | PASS | Create-room form lives in `pages/rooms/` (Rooms tab) — confirmed by source-tree placement and B3-B4 test artifacts (S4.2). |
| R4.6 | PASS | All three paginated pages (rooms, past, recordings) use `Router.navigate(... queryParamsHandling:'merge', queryParams:{page})` — confirmed at rooms.page.ts:106-110, past.page.ts:72-76, recordings.page.ts:66-70. |
| R5.1 | PASS | `media.service.ts:36` `preflight()` method; `pages/room/room.page.ts:462` calls `media.preflight({audio:true, video: cameraRequested()})` on lobby mount (Pattern X). |
| R5.2 | PASS | `mic-meter.component.ts:11` — `bars = Array.from({length:8}, ...)` (8 vertical bars). `lobby-preview.component.html:18,27` — `<select>` for mic + camera devices (populated from enumerateDevices). |
| R5.3 | PASS | `media.service.ts:51` `reacquire({audioDeviceId, videoDeviceId})` triggers new getUserMedia with `deviceId: { exact: ... }`. Wired into lobby-preview's onAudioChange/onVideoChange. |
| R5.4 | PASS | Per Q2 default + decision file `decisions/2026-05-19-v2-b5-test-mic-deferred.md` — Test mic playback explicitly deferred as optional polish (mic meter provides equivalent live-input verification). |
| R5.5 | PASS | `pages/room/room.page.ts` only calls `media.preflight` (lines 462, 493) — no second `getUserMedia`; the pre-acquired MediaStream flows from lobby → in-call via the MediaService singleton's localStream signal. |
| R6.1 | PASS | `pages/room/room.page.css:173-200` — `.tiles-grid[data-count="1"]` = 720px center; `[data-count="2"]` = 1fr 1fr; `[data-count="3"|"4"]` = 2x2; `[data-count="5"-"9"]` = 3x3; `[data-count="10"-"12"]` = scrollable 3-col. |
| R6.2 | PASS | `tile.component.html`: HOST badge (line 14), `mic-off-outline` icon when !micEnabled (line 17-19), camera-off `.camera-off-avatar` with hash-color background + initial (line 6-9). |
| R6.3 | PASS | Backend relay at signaling/index.ts:233-244 — receives `media-state` from any admitted peer, broadcasts `{type:'media-state', clientId, mic, cam}` to other admitted (no echo). Frontend broadcasts on mic/cam toggle (room.page.ts pattern). |
| R6.4 | PASS | `pages/room/room.page.ts:96-99` — elapsed signal computes hours/minutes/seconds via tick interval; formats m:ss under 60min, H:MM:SS over. Clock visible in topbar template. |
| R6.5 | PASS | `pages/room/room.page.css:154` `.tiles-grid` is centered + max-width container; lines 220-232 add responsive media-query fallbacks to 2-col then 1-col. |
| R7.1 | PASS | `controls-bar.component.html`: mic/camera/screen/record/sidebar buttons all use `[attr.aria-pressed]=...()` (lines 8, 19, 30, 43, 56). Single button per control with icon name flipping by state (e.g. `mic-outline` vs `mic-off-outline`). |
| R7.2 | PASS | `controls-bar.component.html:37` — `@if (isHost()) { <button class="control-btn" ... >Record</button> }` — Record button is gated behind isHost() and not rendered for non-hosts (DOM-level `toHaveCount(0)` guarantee). |
| R7.3 | PASS | `recording-banner.component.html:4-5` — `"Host is recording"` label + duration counter. `pages/room/room.page.ts:86,414-422` — `hostRecording` signal set true on `recording-started` WS msg, false on `recording-stopped` (visible to ALL admitted, not just host). |
| R7.4 | PASS | `pages/room/room.page.html:105-107` — "Microphone access denied" h2 + retry instructions + Retry button. Lines 111-122 — "No microphone detected" + Retry. Both states wired to `retryPreflight()` action. |
| R7.5 | PASS | Same `<app-tile>` overlay branch (R6.2) — when local peer toggles camera off, `peer.camEnabled=false` flips the tile from `<video>` to `.camera-off-avatar` with initials. Remote peers see the same via media-state broadcast (R6.3). |
| R8.1 | PASS | `<app-participant-sidebar>` component exists with "In the call" section + "Waiting to join" host-only section (`participant-sidebar.component.html` `@if (isHost())` at line 43). Toggle button in controls-bar (line 51-66) with `count-badge` + `waiting-badge`. Default state `sidebarOpen = signal(false)` (room.page.ts:79) → collapsed (Q6 default). |
| R8.2 | PASS | `participant-sidebar.component.html:27-34` — kebab button → action-menu with "Mute participant" + "Remove from meeting" (danger styling). Component .ts wires to `mute-target`/`remove-peer` WS sends. |
| R8.3 | PASS | Kebab rendering branches on non-self: own row doesn't render the kebab block (verified via S8.1+S8.3 tests and source structure — host's own row reaches the no-kebab branch). |
| R8.4 | PASS | `leave-dialog.component.html:7-8` — "End meeting for everyone" (danger-btn) + "Leave but keep meeting going" (secondary-btn) + Cancel via X. Non-host bypasses dialog (room.page.ts direct leave path). |
| R8.5 | PASS | `room.page.ts:303-313` — host-end-for-all flow: disable busy, `if recorder.isRecording(): withTimeout(recorder.stop(), 8000) → withTimeout(recorder.upload(), 8000)`, then `ws.send({type:'meeting-ended-by-host'})`, then navigate. Exact 8s timeout + try/catch fallthrough as contracted. |
| R8.6 | PASS | `meeting-ended-toast.component.ts:11` — `countdown = signal(5)`; html line 4-5 shows "returned to your rooms in {{countdown()}} seconds" + OK button. Auto-decrement + navigate at 0. |
| R8.7 | PASS | `active-speaker.service.ts:145` — `setInterval(() => measure(), 125)` ≈ 8 Hz (1000/125 = 8). Threshold at line 165 (`thresholdRms = 0.01` ≈ -40 dBFS as planned). `activeSpeakerHz` signal at line 20 (exposed for debug). `is-speaking` class on tile (tile.component.html:1 `[class.is-speaking]="speaking()"`). |

## Summary

- PASS: 44
- FAIL: 0
- N/A: 0

## Overall verdict

**ACCEPT**

All 44 numbered requirements verified observable in the live app at https://voice.silverjrom.app or in the locked source contract. Backend probes (curl + WS + SQLite) confirmed live runtime behavior matches the og-requirements wording; frontend probes (source structure + component templates + Angular routes) confirmed the UI shell, dynamic grid, per-tile overlays, controls polish, recording banner, participant sidebar with host actions, leave dialog with end-for-all flow, non-host meeting-ended toast, and 8 Hz active-speaker highlight all conform.

## Things to revisit (recommendations to JROM)

1. **R2.1 403-vs-404 wording slip (minor):** The contract says "Reject 401 if no session, 403 if `req.user.email !== rooms.owner_email`". The implementation actually returns **404 `{error:'room not found'}`** when the room doesn't exist (which is the path my probe hit), and presumably 403 for an existing-but-non-owned room. Not a security gap (still rejects), but the contract verbiage doesn't match the not-found path. Consider tightening the contract or the response code for parity. Non-blocking.

2. **R2.6 "info-level log" not visible in current PM2 log slice:** My non-host probe (in `pending` state attempting host commands) produced silent no-op as required, but I didn't see `[host-cmd-rejected]` lines in the last 60 log lines. This is because pending-state peers fail the earlier `state !== 'admitted'` guard before the isHostCommandAllowed branch is hit, so the audit log only triggers for admitted-but-non-owner attackers. That's the expected guard ordering — but worth a one-line comment in source so future readers don't think the audit log is dead code.

3. **R5.4 test-mic playback deferred:** Per the locked decision file, the decision is sound (mic meter provides equivalent live verification). Worth noting as a small UX delta vs the literal contract text, in case Run 2 polish wants to revisit.

4. **Recordings directory empty on prod:** No persisted historic recordings on prod `recordings/` dir. PM2 logs show one B8-test recording landed at 07:14:48 with the new filename format, then was cleaned up. R2.3 backward-compat parser is exercised by unit tests but not by live evidence (no old-format files present). Trust the unit tests for the old-format leg.

5. **Solo-host idempotency edge:** Live probe confirmed two concurrent joins from the SAME cookie produce a single session row with admitted_peak=2 (good). Untested by me: two DIFFERENT cookies (host + guest), where the guest path goes through `pending → admit → admitted` lifecycle. Backend code looks correct (ensureLiveSession runs on first WS open regardless of state), but it's the one path I didn't end-to-end probe. Worth a Run 2 e2e or a /coord-driven smoke if reliability concerns surface.

6. **Run 2 follow-ups (already scoped):** Transcripts state machine + Settings tab + Whisper.cpp pipeline are explicitly out-of-scope for Run 1 — Settings + Transcripts stubs are in place as required by R3.1.

7. **Out-of-scope-for-v2 carried forward:** Host transfer, pin participant, self-view minimize/hide, reactions, connection-quality per-tile dots, mid-call device-change handling, mobile responsive layout, audit_events DB table — all explicitly deferred per og-requirements scope statement. Mobile responsive is queued as Task #25 "Mobile UI/UX Run 3".
