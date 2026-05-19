# scenarios.md — meet-poc rebuild

**Owned by:** /projcore (per JROM directive 2026-05-19 "you validate and create the scenarios").

Scenarios are the **observable behavior contracts** that anchor every batch's test-report. Codex (implementer) ports/writes the tests; /projcore reads scenario coverage during batch validation per §1.11 evidence quality gate.

Each scenario:
- Has a unique ID (`S<req#>.<n>`).
- Maps to one or more `og-requirements.md` Req#s.
- Has explicit **Given/When/Then** observable steps.
- Specifies the **proof level** (UI / API / WS-protocol / file-on-disk).
- Lists **the batch** that closes it.

---

## B1 — Backend foundation scenarios

### S1.1 — Login with valid credentials returns 200 + sets cookie [R1.1, R1.6]
- **Given** the SQLite DB has a seeded user `jrom@silverjrom.app` with the initial password
- **When** the test POSTs `/api/login` with `{email: "jrom@silverjrom.app", password: <initial>}`
- **Then** response is 200, body is `{email: "jrom@silverjrom.app"}`, and `Set-Cookie: session=…; HttpOnly; Path=/; SameSite=Lax` is present
- **Proof:** API (supertest or Playwright `request`) — backend unit test acceptable

### S1.2 — Login with wrong password returns 401 [R1.1]
- **Given** seeded user exists
- **When** POST `/api/login` with wrong password
- **Then** response is 401, no Set-Cookie issued, backend log line includes "[login] FAIL" with masked email
- **Proof:** API + backend log capture

### S1.3 — `/api/me` returns null without cookie, user with valid cookie [R1.2]
- **Given** a valid session cookie (obtained via S1.1)
- **When** GET `/api/me` with the cookie
- **Then** response is `{user: {email: "jrom@silverjrom.app"}}`
- **And** GET `/api/me` without cookie returns `{user: null}`
- **Proof:** API

### S1.4 — Logout invalidates the session [R1.3, R1.5]
- **Given** a valid session
- **When** POST `/api/logout`
- **Then** subsequent GET `/api/me` with the same cookie returns `{user: null}`
- **Proof:** API

### S1.5 — Password is hashed (not plaintext) in SQLite [R1.4]
- **Given** seed has run
- **When** the test queries `SELECT password_hash FROM users WHERE email=?` directly via better-sqlite3
- **Then** the column does NOT equal the initial password; format matches `<saltHex>:<hashHex>` or bcrypt `$2a$…`
- **Proof:** DB inspection

### S1.6 — Expired session is rejected [R1.5]
- **Given** a session row with `expires_at < now()`
- **When** GET `/api/me` with that cookie
- **Then** response is `{user: null}` AND the session row is deleted from SQLite
- **Proof:** API + DB

### S1.7 — Data migrated from data.json if present [R10.2]
- **Given** legacy `data.json` exists with one user; SQLite DB does not yet have that user
- **When** `npm run migrate-from-json` (or first-boot migration) executes
- **Then** SQLite `users` table contains the migrated user with the same password hash
- **And** a follow-up POST `/api/login` with the original credentials succeeds
- **Proof:** DB + API

---

## B2 — Rooms API + signaling scenarios

### S2.1 — Authenticated user creates a room [R2.1, R2.5]
- **Given** authenticated session
- **When** POST `/api/rooms` with `{title: "Team sync"}`
- **Then** 200, body is `{room: {id, title: "Team sync", ownerEmail: "jrom@silverjrom.app", createdAt}}`, `id` matches `/^[a-f0-9]{12}$/`
- **Proof:** API

### S2.2 — Unauthenticated room create is rejected [R2.1]
- **Given** no session cookie
- **When** POST `/api/rooms`
- **Then** 401
- **Proof:** API

### S2.3 — List returns only my rooms newest-first [R2.2]
- **Given** authenticated user owns 3 rooms created at t1<t2<t3
- **When** GET `/api/rooms`
- **Then** response is `{rooms: [t3, t2, t1]}`
- **Proof:** API

### S2.4 — Delete-own room succeeds; delete others' returns 403 [R2.3]
- **Given** authenticated user owns room A; another simulated user owns room B
- **When** DELETE `/api/rooms/A`
- **Then** 200 + room A no longer in `/api/rooms`
- **When** DELETE `/api/rooms/B`
- **Then** 403
- **Proof:** API

### S2.5 — Public room-exists endpoint [R2.4]
- **Given** room "Team sync" exists with id X
- **When** GET `/api/rooms/X/exists` (no auth)
- **Then** `{exists: true, title: "Team sync"}`
- **When** GET `/api/rooms/nonexistent/exists`
- **Then** `{exists: false}`
- **Proof:** API

### S2.6 — Owner auto-admit on WS join [R3.2]
- **Given** owner of room X has a valid session, room X is empty (no admitted peers)
- **When** owner opens WS, sends `{type:'join', room:'X', name:'Owner'}`
- **Then** owner receives `{type:'admitted', clientId, peers:[], roomTitle:"…", isOwner:true}`
- **Proof:** WS-protocol test (vitest + `ws` client)

### S2.7 — Non-owner joins → knock → owner admit → both peer-joined [R3.3, R3.4]
- **Given** owner connected (from S2.6), room X is open
- **When** a second WS client (no session, name "Guest") sends `{type:'join', room:'X', name:'Guest'}`
- **Then** Guest receives `{type:'knocking', clientId, roomTitle}`
- **And** Owner receives `{type:'knock', clientId, name:'Guest'}`
- **When** Owner sends `{type:'admit', clientId: <guest>}`
- **Then** Guest receives `{type:'admitted', clientId, peers:[…], roomTitle, isOwner:false}`
- **And** Owner receives `{type:'peer-joined', clientId, name:'Guest'}`
- **Proof:** WS-protocol test (two-client harness)

### S2.8 — Reject closes the guest socket with reason [R3.4]
- **Given** Owner connected, Guest knocking
- **When** Owner sends `{type:'reject', clientId: <guest>, reason:'no'}`
- **Then** Guest receives `{type:'rejected', reason:'no'}` and socket is closed
- **And** Owner receives `{type:'knock-cancelled', clientId}`
- **Proof:** WS-protocol test

### S2.9 — Signal relay between admitted peers [R3.5]
- **Given** two admitted peers in room X (Owner + Guest1 admitted)
- **When** Owner sends `{type:'signal', to: <guest>, data:{sdp:'fake-offer'}}`
- **Then** Guest receives `{type:'signal', from: <owner>, data:{sdp:'fake-offer'}}`
- **And** signal sent to a non-admitted client is dropped silently
- **Proof:** WS-protocol test

### S2.10 — Disconnect emits peer-left to remaining [R3.6]
- **Given** Owner + Guest admitted
- **When** Guest socket closes
- **Then** Owner receives `{type:'peer-left', clientId: <guest>}`
- **Proof:** WS-protocol test

### S2.11 — Room-full enforcement at 8 peers [R3.8]
- **Given** room X has 8 admitted peers
- **When** a 9th client sends `{type:'join', room:'X', …}`
- **Then** the 9th client receives `{type:'error', error:'room full (max 8)'}` and socket closes
- **Proof:** WS-protocol test

### S2.12 — Wire format identical to legacy server.js [R3.7]
- **Given** a fresh wire-format reference doc captured from current `server.js` (see B0 artifact `wire-format.md` if produced; else manual diff)
- **When** comparing new TS implementation's message shapes
- **Then** every `type` value + payload keys match exactly
- **Proof:** doc diff

---

## B3 — Angular shell + auth + dashboard scenarios

### S3.1 — Login page renders, login succeeds, navigates to /dashboard [R4.2, R4.4]
- **Given** Angular dev server running, no session
- **When** Playwright `page.goto("/login")` + fills email/password + clicks Sign in
- **Then** URL changes to `/dashboard`, dashboard topbar visible with user email, **login panel is NOT visible in DOM** (assertion: `expect(page.locator('.login-card')).not.toBeVisible()`)
- **Proof:** UI (Playwright)

### S3.2 — `/dashboard` without session redirects to `/login` [R4.2]
- **Given** no session cookie
- **When** `page.goto("/dashboard")`
- **Then** URL ends up at `/login`
- **Proof:** UI

### S3.3 — `/login` with active session redirects to `/dashboard` [R4.2]
- **Given** valid session cookie
- **When** `page.goto("/login")`
- **Then** URL ends up at `/dashboard`
- **Proof:** UI

### S3.4 — Create room via UI [R4.5, R2.1]
- **Given** authenticated on `/dashboard`
- **When** user types "Team sync" + clicks Create room
- **Then** new room appears in the list with correct title + share URL `…/room/<id>` + Join/Copy/Delete buttons
- **Proof:** UI

### S3.5 — Stitched-panel symptom absent — login NOT visible after auth [R4.8]
- **Given** authenticated user on `/dashboard`
- **When** Playwright inspects the DOM
- **Then** **NO element matching login form selectors is in the rendered viewport** (`page.locator('input[type="email"]').count() === 0` OR `not.toBeVisible()`)
- **Proof:** UI — this is the scenario that closes JROM's "stitched up app" complaint at the requirements level

### S3.6 — Logout clears session and routes to /login [R1.3, R4.2]
- **Given** authenticated user on `/dashboard`
- **When** clicks Logout
- **Then** URL → `/login`, GET `/api/me` returns `{user: null}`
- **Proof:** UI + API

### S3.7 — Delete room with confirmation [R2.3, R4.5]
- **Given** owner of a room, on `/dashboard`
- **When** clicks Delete + confirms
- **Then** room disappears from list, subsequent visit to `/room/<that-id>` shows "Room not found" lobby state
- **Proof:** UI

### S3.8 — Copy-link button copies share URL [R4.5]
- **Given** dashboard with one room
- **When** clicks Copy link
- **Then** clipboard contents (read via `page.evaluate(() => navigator.clipboard.readText())` with Playwright clipboard permission) === expected URL
- **Proof:** UI

---

## B4 — Call UI + WebRTC client scenarios

### S4.1 — Guest lobby on /room/:id shows room title [R4.6]
- **Given** room "Team sync" exists, no session
- **When** `page.goto("/room/<id>")`
- **Then** lobby card shows "Team sync" title + name field + Ask-to-join button
- **And** dashboard topbar is NOT visible (no panel-stitching) [R4.8]
- **Proof:** UI

### S4.2 — Owner auto-admit on `/room/:id` [R4.6, R3.2]
- **Given** authenticated owner of room X
- **When** `page.goto("/room/<X>")` + enters name + clicks Join
- **Then** call view appears (tile grid + controls bar), no knock state ever shown
- **Proof:** UI

### S4.3 — Two-context P2P signaling happy path [R3, R5.1]
- **Given** Playwright launches two browser contexts with fake media flags
- **When** Context A (owner) joins, Context B (guest) joins, owner admits
- **Then** both contexts show 2 tiles, RTC connection state per peer reaches "connected"
- **Proof:** UI two-context (this is the costly test — runs as targeted, not in every cycle)

### S4.4 — Owner waiting-room admit/reject [R4.7, R3.4]
- **Given** owner in call, guest knocking
- **When** owner clicks Admit
- **Then** owner sees new tile for guest; guest call view appears
- **When** another guest knocks and owner clicks Reject
- **Then** guest's tab navigates to a "rejected" message; owner waiting-room list updates
- **Proof:** UI two-context

### S4.5 — Mute / camera-toggle / screen-share controls [R5.3]
- **Given** in a call (1 peer alone OK)
- **When** clicks Mute, then unmute; clicks Camera on, then off; clicks Share screen
- **Then** local mic track `enabled` flips; local video track `enabled` flips; `getDisplayMedia` is called once (Playwright stub)
- **Proof:** UI + page.evaluate inspection of `state.localStream.getAudioTracks()[0].enabled` etc

### S4.6 — Leave call returns to /dashboard [R4.7]
- **Given** in a call as owner
- **When** clicks Leave
- **Then** URL → `/dashboard`, no WS connection lingering
- **Proof:** UI + network panel

### S4.7 — Room full (9th peer) shows error [R3.8, R5.5]
- **Given** room has 8 admitted peers (simulated)
- **When** 9th tries to join via lobby
- **Then** lobby shows "Room full (max 8)" error inline
- **Proof:** UI (simulated via WS mock)

### S4.8 — Warning at 6 peers [R5.5]
- **Given** room has 6 admitted peers
- **When** user views call panel
- **Then** non-blocking banner: "Calls with more than 6 participants may be unstable on this stack"
- **Proof:** UI

---

## B5 — Recording scenarios

### S5.1 — Record button starts recording, indicator appears [R6.1, R6.2, R6.4]
- **Given** in a call
- **When** clicks Record
- **Then** recording indicator visible; Record button label changes to Stop
- **Proof:** UI

### S5.2 — Stop recording uploads .webm and surfaces on dashboard [R6.2, R6.3, R6.4]
- **Given** recording active for ≥2s in room X
- **When** clicks Stop
- **Then** POST `/upload` is sent with binary body + headers; `recordings/<timestamp>_<slug>_<rand>.webm` exists on disk with non-zero size
- **And** dashboard "Recordings" section lists the file with download link
- **Proof:** UI + filesystem + API

### S5.3 — Audio mix includes peer track [R6.1]
- **Given** in a call with 1 admitted peer, fake mic + peer audio
- **When** record 2 seconds, stop, download `.webm`
- **Then** ffprobe shows audio track present, file size > minimum threshold
- **Proof:** UI + ffprobe

---

## B6 — coturn + cutover scenarios

### S6.1 — coturn process running [R7.1]
- **Given** B6 install ran
- **When** test runs `ss -lun | grep <coturn-port>` (or `pm2 list` / `systemctl status coturn`)
- **Then** coturn is listening
- **Proof:** shell

### S6.2 — Frontend ICE_SERVERS includes coturn URL [R7.2]
- **Given** built `frontend/dist/` artifacts
- **When** grep the bundled JS for the coturn URL
- **Then** match present + credentials embedded via env config
- **Proof:** filesystem

### S6.3 — voice.silverjrom.app serves the new app [R8.3, R8.4]
- **Given** CF Tunnel pointing to new consolidated port; PM2 has `meet-poc-be` + `meet-poc-fe` running and `meet-poc` retired
- **When** `curl -s https://voice.silverjrom.app/ | grep -i angular` (or similar Angular marker like `<app-root>`)
- **Then** match present
- **And** Playwright headed visit shows the new login page (NOT the old stitched one)
- **Proof:** curl + UI

### S6.4 — End-to-end smoke (final acceptance) [all R]
- **Given** new app deployed at voice.silverjrom.app
- **When** independent validator opens it, logs in, creates a room, opens a second context as guest, owner admits, both see tiles, owner records 5s, stops, downloads
- **Then** entire flow completes without errors
- **Proof:** UI + filesystem + recorded video as evidence

### S6.5 — Legacy recordings preserved [R10.1]
- **Given** pre-cutover `recordings/` had N files
- **When** B6 cutover complete
- **Then** `recordings/` still contains the N files (no deletion)
- **Proof:** filesystem

### S6.6 — Rollback dry-run [R10.3]
- **Given** old `meet-poc` PM2 entry still defined in `ecosystem.config.js` (commented or under a `--legacy` flag)
- **When** test runs the documented rollback steps in a worktree
- **Then** old app comes back online on the old port
- **Proof:** filesystem + shell

---

## Cross-batch quality gates (every batch must satisfy)

- **No `page.setContent` static-HTML smell** in any spec — tests must `page.goto()` the real app (§2.10).
- **Every cited screenshot must show the claimed page/state** (Q3 evidence quality).
- **Every PASS scenario must have a corresponding test in the batch's `test-report.md`** (Q4 scenario-to-test consistency).
- **Backend unit tests** (vitest) live under `backend/tests/`; **Playwright e2e** lives under `e2e/tests/<batch>/`.

## Test-iteration discipline (per §2.10a)

- Per-module targeted runs first — `npx playwright test e2e/tests/<batch>/ --config=e2e/playwright.config.ts`.
- Full e2e only when every module-targeted batch is GREEN — used as sanity check, not iteration loop.
