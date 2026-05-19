# scenarios.md — meet-poc v2 Run 1

Owned by /projcore. Per-batch evidence-quality contracts. Codex implements the tests; /projcore reads them under §2.10 validator discipline.

Each scenario: unique ID `S<R#>.<n>`, maps to R# in og-requirements.md, has Given/When/Then with proof level.

---

## B1 — Backend sessions + API

### S1.1 — Session opens on first WS join, idempotent within room [R1.2]
- **Given** room X exists, no active session
- **When** owner WS connects + sends `join`
- **Then** SQLite `meeting_sessions` has one row with `room_id=X, host_email=<owner>, started_at>now-1s, ended_at IS NULL, admitted_peak=1`
- **And** a second non-owner WS joining the same room within the active window does NOT create a second row
- **Proof:** DB query in vitest + WS clients

### S1.2 — admitted_peak tracks the high water mark [R1.4]
- **Given** session open with admitted_peak=1 (owner)
- **When** guest1 admits → peak should become 2; guest1 leaves; guest2 admits → peak stays 2 (still high water)
- **Then** DB `admitted_peak=2` at end
- **Proof:** DB query + WS scripted sequence

### S1.3 — Session closes on host-end [R1.3]
- **Given** session open with 2 admitted peers
- **When** host sends `{type:'meeting-ended-by-host'}` via WS
- **Then** session row has `ended_at` non-null, `ended_reason='host-end'`, and both peers' WS are closed
- **Proof:** DB + WS observers

### S1.4 — Session closes on last peer leave [R1.3]
- **Given** session open with 1 admitted peer (not host)
- **When** peer disconnects → admitted count = 0
- **Then** session row gets `ended_at`, `ended_reason='last-peer-left'`
- **Proof:** DB

### S1.5 — Session closes on host disconnect with empty room [R1.3]
- **Given** owner joins alone (admitted_peak=1 → drops to 0 if they leave)
- **When** owner WS disconnects without any other peers ever joining
- **Then** session row closes with `ended_reason='host-disconnect-empty'`
- **Proof:** DB

### S1.6 — Active sessions listing [R1.5]
- **Given** 2 sessions open in 2 rooms owned by jrom, 1 session in a room owned by other-user
- **When** authenticated jrom hits `GET /api/meeting-sessions?status=active`
- **Then** response = `{sessions: [...], total: 2}` with only jrom's two sessions
- **Proof:** API via supertest

### S1.7 — Ended sessions filter junk (admitted_peak < 1 OR duration < 10s) [R1.5]
- **Given** 3 ended sessions: A (peak=2, 30s long), B (peak=1, 5s long), C (peak=0, 60s long — host alone)
- **When** GET `/api/meeting-sessions?status=ended`
- **Then** only A is returned
- **Proof:** API + DB fixtures

### S1.8 — Pagination [R1.5]
- **Given** 25 ended sessions matching the filter
- **When** GET `/api/meeting-sessions?status=ended&page=1&pageSize=20`
- **Then** `{sessions: [20 items], page:1, pageSize:20, total:25}`
- **When** GET `/api/meeting-sessions?status=ended&page=2&pageSize=20`
- **Then** `{sessions: [5 items], page:2, pageSize:20, total:25}`
- **Proof:** API

## B2 — Backend host authority + recording binding

### S2.1 — /upload requires session cookie [R2.1]
- **Given** no cookie
- **When** POST `/upload` with binary body + `X-Ext: webm` + `X-Room: <id>`
- **Then** 401 `{error:'unauthorized'}`
- **Proof:** API

### S2.2 — /upload non-host returns 403 [R2.1]
- **Given** authed as `other@silverjrom.app`, room owned by jrom
- **When** POST `/upload` with `X-Room: <jrom's room>`
- **Then** 403 `{error:'forbidden'}`
- **Proof:** API

### S2.3 — /upload requires open meeting session [R2.2]
- **Given** authed as host, valid room, but NO open meeting_session for this (room, host)
- **When** POST `/upload`
- **Then** 409 `{error:'no open meeting session'}` + no file on disk
- **Proof:** API + filesystem

### S2.4 — /upload happy path embeds sessionId in filename [R2.3]
- **Given** authed as host, open session for the room
- **When** POST `/upload` with binary body
- **Then** 200 `{ok:true, file: ..., bytes: ...}` + file on disk matching `<ts>_<sessionId>_<roomId>_<slug>_<rand>.webm`
- **Proof:** API + filesystem regex

### S2.5 — Recording-started/stopped broadcast [R2.4]
- **Given** host + 1 admitted guest in a call
- **When** host's client sends `{type:'recording-state', state:'started'}`
- **Then** both host's and guest's WS receive `{type:'recording-started', clientId:<host>, sessionId}`
- **And** same for `'stopped'` → `recording-stopped`
- **Proof:** WS test clients

### S2.6 — meeting-ended-by-host broadcasts + closes sockets [R2.5]
- **Given** host + 2 admitted guests
- **When** host sends `{type:'meeting-ended-by-host'}`
- **Then** both guests receive `{type:'meeting-ended', reason:'host-end'}` THEN their WS close
- **And** session row closes with `ended_reason='host-end'`
- **Proof:** WS + DB

### S2.7 — mute-target sends mute-request to target only [R2.5]
- **Given** host + 2 admitted guests
- **When** host sends `{type:'mute-target', clientId: <guest1>}`
- **Then** guest1 receives `{type:'mute-request', from:<host>}`; guest2 receives nothing
- **Proof:** WS

### S2.8 — remove-peer closes target socket + broadcasts peer-left [R2.5]
- **Given** host + 2 admitted guests
- **When** host sends `{type:'remove-peer', clientId: <guest1>}`
- **Then** guest1 receives `{type:'peer-removed', reason:...}` then their WS closes; host + guest2 receive `{type:'peer-left', clientId:<guest1>}`
- **Proof:** WS

### S2.9 — Non-host issuing host commands is dropped silently [R2.6]
- **Given** non-owner guest in a call
- **When** guest sends `{type:'mute-target', clientId: <host>}` or `remove-peer` or `meeting-ended-by-host`
- **Then** no broadcasts, host's mic unaffected, session stays open, server logs at info level
- **Proof:** WS + server log capture

## B3 — App shell refactor

### S3.1 — /dashboard redirects to /app/rooms [R3.2]
- **Given** authed user
- **When** `page.goto('/dashboard')`
- **Then** URL becomes `/app/rooms`
- **Proof:** Playwright

### S3.2 — Sidebar nav links visible + active state [R3.3]
- **Given** authed on `/app/rooms`
- **When** sidebar inspected
- **Then** 6 nav items visible (Rooms, Ongoing, Past meetings, Recordings, Transcripts, Settings); "Rooms" has `aria-current="page"` or equivalent active class
- **Proof:** Playwright DOM

### S3.3 — Transcripts + Settings show "Coming in Run 2" stub [R3.1]
- **Given** authed
- **When** navigate to `/app/transcripts` and `/app/settings`
- **Then** each renders a stub page indicating "Coming in v2 Run 2"
- **Proof:** Playwright

### S3.4 — Auth guard at /app/** [R3.4]
- **Given** no session
- **When** `page.goto('/app/rooms')` (or any /app/* path)
- **Then** redirect to `/login`
- **Proof:** Playwright

## B4 — Tabs + pagination

### S4.1 — Rooms tab paginated, page param in URL [R4.1, R4.6]
- **Given** 25 rooms owned by jrom
- **When** `page.goto('/app/rooms')`
- **Then** 20 rows shown + "Page 1 of 2" + Next button enabled
- **When** click Next
- **Then** URL becomes `/app/rooms?page=2`, 5 rows shown, Prev enabled, Next disabled
- **Proof:** Playwright (seed DB with 25 rooms first)

### S4.2 — Create room form stays on Rooms tab [R4.5]
- **Given** `/app/rooms`
- **When** create a room via the inline form
- **Then** room appears in list, stay on Rooms tab
- **Proof:** Playwright

### S4.3 — Ongoing tab shows live sessions, 5s poll updates [R4.2]
- **Given** seed an active meeting_session in the DB
- **When** `page.goto('/app/ongoing')`
- **Then** 1 row shown with room title + admitted count + Join link
- **When** insert a 2nd active session via direct DB write
- **Then** within ~6 seconds, 2 rows visible (poll picks it up)
- **Proof:** Playwright + DB fixture

### S4.4 — Past tab shows ended sessions with duration [R4.3]
- **Given** seed 2 ended sessions matching the filter
- **When** `page.goto('/app/past')`
- **Then** both rows visible with formatted duration (e.g. "0:34", "1:12:05")
- **Proof:** Playwright

### S4.5 — Recordings tab on /app/recordings [R4.4]
- **Given** seed a recording file + matching room ownership
- **When** `page.goto('/app/recordings')`
- **Then** recording row visible with Download link
- **Proof:** Playwright

## B5 — Lobby device preview

### S5.1 — Lobby pre-grants getUserMedia [R5.1]
- **Given** room exists, navigate to `/room/:id`
- **When** lobby mounts (Playwright with fake media permissions auto-grant)
- **Then** within 2s, local mic + camera streams are acquired (verified via `__meetDebug.localStream` exposing `getAudioTracks().length > 0`)
- **Proof:** Playwright + window debug hook

### S5.2 — Mic level meter shows activity [R5.2]
- **Given** lobby mounted with fake mic (beep tone)
- **When** observed for 2s
- **Then** at least 1 of the 8 meter bars has its CSS class indicate "active" (computed style or class assertion)
- **Proof:** Playwright

### S5.3 — Device selector populates from enumerateDevices [R5.2]
- **Given** lobby mounted
- **When** mic selector dropdown opened
- **Then** at least 1 option visible (the fake-media virtual device)
- **Proof:** Playwright

### S5.4 — Permission denied state [R5.1 + R7.4]
- **Given** Playwright launched WITHOUT `--use-fake-ui-for-media-stream` (denies media)
- **When** lobby mounts
- **Then** error UI visible: "Microphone access denied — ... Retry"
- **Proof:** Playwright with explicit `permissions: []` override

### S5.5 — Join carries pre-acquired stream into call [R5.5]
- **Given** lobby grants media + click Join
- **When** state transitions to `in-call`
- **Then** `__meetDebug.localStream` is the SAME stream object (or at least same trackIds) before vs after the transition (no second getUserMedia call evidenced)
- **Proof:** Playwright + window debug hook

## B6 — In-call grid + per-tile overlays + clock

### S6.1 — 1-peer grid centers and caps width [R6.1]
- **Given** owner alone in call (no admitted peers)
- **When** tiles-grid measured
- **Then** the single tile has `clientWidth <= 720` AND is horizontally centered (offsetLeft + width/2 ~= viewport center)
- **Proof:** Playwright + `page.evaluate(boundingClientRect)`

### S6.2 — 2-peer grid is side-by-side [R6.1]
- **Given** owner + 1 admitted guest
- **When** tiles measured
- **Then** 2 tiles with `width >= 40%` and `height` roughly equal, horizontally adjacent
- **Proof:** Playwright two-context

### S6.3 — Muted icon overlay visible when peer mutes [R6.2 + R6.3]
- **Given** owner + 1 admitted guest, both unmuted
- **When** guest clicks their Mute button
- **Then** within 2s, on owner's view, the guest's tile shows a mute icon overlay (`<app-tile data-muted="true">` or similar)
- **Proof:** Playwright two-context

### S6.4 — Camera-off avatar shows initials [R6.2 + R6.3]
- **Given** guest in call with camera ON, then clicks Camera button OFF
- **When** owner observes guest's tile
- **Then** within 2s, tile shows a circle with the guest's first letter (uppercase) as text — no video element visible
- **Proof:** Playwright two-context

### S6.5 — Host badge on host's tile only [R6.2]
- **Given** owner + 1 guest in call
- **When** any participant observes both tiles
- **Then** owner's tile shows "HOST" pill; guest's tile does not
- **Proof:** Playwright

### S6.6 — Meeting clock counts up [R6.4]
- **Given** owner enters in-call state
- **When** observe clock at t=0, t=2s
- **Then** clock shows `0:00` initially, then advances to `0:02` (±1s tolerance)
- **Proof:** Playwright

## B7 — Controls polish + recording banner + device failure UX

### S7.1 — Record button hidden for non-host [R7.2]
- **Given** guest (non-owner) in call
- **When** controls bar inspected
- **Then** Record button has `display:none` (or `.toHaveCount(0)`)
- **Proof:** Playwright two-context

### S7.2 — Record button visible for host [R7.2]
- **Given** owner in call
- **When** controls bar inspected
- **Then** Record button visible
- **Proof:** Playwright

### S7.3 — Recording banner visible to all on host-record [R7.3]
- **Given** owner + 1 admitted guest
- **When** host clicks Record
- **Then** within 2s, both host's and guest's views show "Host is recording" banner with red dot + duration counter
- **When** host clicks Stop
- **Then** banner disappears on both within 2s
- **Proof:** Playwright two-context

### S7.4 — Permission denied error UI in lobby [R7.4]
- **Given** browser launched with mic permission denied
- **When** lobby mounted
- **Then** error message + Retry button visible
- **Proof:** Playwright

### S7.5 — Icon-state controls have aria-pressed [R7.1]
- **Given** in call
- **When** Mute button inspected (aria-pressed=false initially)
- **When** clicked
- **Then** aria-pressed=true; click again returns to false
- **Proof:** Playwright

## B8 — Sidebar + host actions + leave UX + active-speaker

### S8.1 — Sidebar opens on toggle, shows participants [R8.1]
- **Given** owner + 1 admitted + 1 knocker
- **When** click sidebar toggle button
- **Then** sidebar visible, "In the call" lists 2 names (host + guest), "Waiting to join" lists 1 (knocker)
- **Proof:** Playwright two-context (owner view)

### S8.2 — Knockers section hidden for non-host [R8.1]
- **Given** 2 admitted (host + guest), 1 knocker
- **When** guest opens sidebar
- **Then** "Waiting to join" section NOT rendered; "In the call" shows 2 names
- **Proof:** Playwright

### S8.3 — Host mute-participant triggers mute on target [R8.2]
- **Given** owner + 1 guest, both unmuted
- **When** owner opens sidebar → kebab on guest's row → "Mute participant"
- **Then** guest receives mute-request → their local mic is muted (verified via `__meetDebug.localStream.getAudioTracks()[0].enabled === false` in guest context)
- **And** guest's tile (in owner's view) shows mute icon within 2s
- **Proof:** Playwright two-context

### S8.4 — Host remove-participant kicks target [R8.2]
- **Given** owner + 1 guest
- **When** owner opens sidebar → kebab on guest's row → "Remove from meeting"
- **Then** guest's URL navigates away from `/room/:id` within 2s (kicked)
- **And** owner's view shows guest tile removed
- **Proof:** Playwright two-context

### S8.5 — Host Leave dialog shows two options [R8.4]
- **Given** owner in call (no recording)
- **When** owner clicks Leave button
- **Then** modal appears with "End meeting for everyone" + "Leave but keep meeting going" buttons
- **Proof:** Playwright

### S8.6 — Non-host Leave is direct [R8.4]
- **Given** guest in call
- **When** guest clicks Leave
- **Then** no modal; navigates directly to `/` or stays on lobby (depending on auth)
- **Proof:** Playwright two-context

### S8.7 — End-meeting-for-everyone client-flushes recording [R8.5]
- **Given** owner in call, recording active, 1 admitted guest
- **When** owner clicks Leave → "End meeting for everyone"
- **Then** within 10s: recording stops + uploaded file exists in `recordings/`, guest receives `meeting-ended` toast, both sockets closed, owner lands on `/app/rooms`
- **Proof:** Playwright two-context + filesystem check

### S8.8 — Non-host receives meeting-ended toast [R8.6]
- **Given** owner + 1 guest in call
- **When** owner ends meeting
- **Then** guest sees modal "The host ended this meeting" with OK + 5s auto-dismiss + navigates to `/app/rooms`
- **Proof:** Playwright two-context

### S8.9 — Active-speaker highlight when audio above threshold [R8.7]
- **Given** owner + 1 guest with fake media (continuous beep at known volume)
- **When** observed for 3s
- **Then** at some point, one tile has the active-speaker ring class (e.g. `.is-speaking`). Tolerant: ANY tile gets the ring during the observation window.
- **And** the analyzer cadence is verified via window debug hook: `__meetDebug.activeSpeakerHz` reports between 6-10 Hz (proves the 8Hz throttle)
- **Proof:** Playwright + window debug hook

---

## Cross-batch quality gates

- No `page.setContent` smell.
- Every test cleans up the rooms/sessions/recordings it creates (R4 hygiene rule).
- Screenshots for: B5 lobby preview, B6 1-peer + 2-peer + 3-peer grid, B7 host vs non-host control bar, B7 recording banner, B8 sidebar open, B8 Leave dialog.
- Per-module targeted Playwright (§2.10a). Full e2e is Phase 2 sanity check.
