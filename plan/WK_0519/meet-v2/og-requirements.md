# og-requirements.md — meet-poc v2 (Run 1: sessions + host authority + UI overhaul)

**Locked:** 2026-05-19 by JROM via /projcore v2 intake, after consults with Codex (REVISE → folded) + Claude-peer (REVISE → folded).
**Mode:** autonomous-complete; JROM-validated final smoke.
**Predecessor contract:** `plan/WK_0519/meet-rebuild/og-requirements.md` (49/53 VERIFIED — base state). All B1-B6 reqs from that run remain in force; v2 reqs ADD on top.

**This is the contract.** Final acceptance only when every Run 1 row in `req-matrix.md` reads VERIFIED. Run 2 (transcripts + settings) is a separate /projcore session.

---

## Scope statement

Add to the existing meet-poc rebuild:
- Backend: `meeting_sessions` entity + lifecycle + paginated API; host authority for recording + meeting-end + soft mute/remove; recording bound to current open session
- Frontend: `/dashboard` → `/app/*` sidebar shell with tabs (Rooms, Ongoing, Past, Recordings); Rooms pagination; lobby device preview; dynamic Google-Meet-style in-call grid with per-tile overlays; meeting clock; "Host is recording" banner visible to all; participant sidebar with host actions; Leave-confirm dialog with client-flush-recorder; active-speaker highlight

**Out of scope (explicit, deferred to v2.5+):** host transfer, pin participant, self-view minimize/hide, reactions/raise-hand, connection-quality dots per tile, mid-call device-change handling, mobile responsive layout, audit_events DB table (use PM2 logs), transcript state machine in DB.

**Out of scope (Run 2):** Whisper.cpp pipeline, Transcripts tab, Settings tab.

---

## R1 — Backend: meeting_sessions + API

- **R1.1** New SQLite migration `backend/migrations/0003_meeting_sessions.sql` adds:
  ```sql
  CREATE TABLE IF NOT EXISTS meeting_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    host_email TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    ended_reason TEXT,          -- 'host-end' | 'last-peer-left' | 'host-disconnect-empty'
    admitted_peak INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_room ON meeting_sessions(room_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON meeting_sessions(ended_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_started ON meeting_sessions(started_at);
  ```
- **R1.2** A `meeting_session` row OPENS the first time any peer (host or guest, admitted or knocking) opens a WS connection to `/ws` and successfully `join`s a known room. Sets `id=uuidv4`, `started_at=now`, `admitted_peak=0` or `1` per the joiner's admission status. Idempotent — if a row for `(room_id, started_at..., ended_at=NULL)` is already open, reuse it.
- **R1.3** A `meeting_session` row CLOSES (`ended_at=now`) on the FIRST of these triggers:
  - Host emits `meeting-ended-by-host` (R2.5) → `ended_reason='host-end'`
  - The room becomes empty (admitted + pending both reach 0) → `ended_reason='last-peer-left'`
  - The host disconnects WS while admitted_count is already 0 → `ended_reason='host-disconnect-empty'` (this is the "host opened then closed alone" edge)
- **R1.4** `admitted_peak` is updated every time `live.admitted.size` reaches a new high for that session.
- **R1.5** `GET /api/meeting-sessions?status=&page=&pageSize=` (auth required):
  - `status=active` → rows where `ended_at IS NULL`, joined to room ownership filter (`rooms.owner_email = req.user.email`)
  - `status=ended` → rows where `ended_at IS NOT NULL AND admitted_peak >= 1 AND (ended_at - started_at) >= 10000` (filters junk: solo-host with no joiners, <10s blips)
  - Pagination: `page` 1-based, `pageSize` defaults 20, capped 100. Response shape: `{sessions: [...], page, pageSize, total}` with `sessions[].roomTitle` joined from rooms table.
- **R1.6** Helper `getOpenSessionFor(roomId, hostEmail)` resolves the currently-open session for a (room, host) pair (used by R2.4). Returns null if none open.

## R2 — Backend: host authority + recording binding

- **R2.1** `POST /upload` (existing endpoint) — **NEW behavior**: derive user from session cookie. Reject 401 if no session, 403 if `req.user.email !== rooms.owner_email` for the supplied `X-Room` header room. The `X-Room` header is an input hint; trust comes from the cookie + DB lookup.
- **R2.2** `POST /upload` additionally rejects 409 with `{error:'no open meeting session'}` if `getOpenSessionFor(roomId, hostEmail)` returns null. Recording must happen inside a live meeting.
- **R2.3** Saved recording filename embeds `meeting_session_id`: `<ISO-ts>_<sessionId>_<roomId>_<roomTitleSlug>_<rand6>.webm`. Backward-incompat with B5 format — list-endpoint parser updated to accept BOTH old (`<ts>_<roomId>_<slug>_<rand>.webm` from rebuild) AND new format (so historic recordings still surface).
- **R2.4** WS protocol additions (server emits to all admitted peers in the room unless noted):
  - `{type:'recording-started', clientId: <hostClientId>, sessionId}` — sent when host's client tells server "I started recording" via new client→server message `{type:'recording-state', state:'started'}`
  - `{type:'recording-stopped', clientId, sessionId}` — same pattern, reverse
  - `{type:'meeting-ended', reason}` — broadcast when host triggers end (R2.5) or session closes server-side
  - `{type:'mute-request', from: <hostClientId>}` — sent ONLY to the targeted peer when host emits `{type:'mute-target', clientId: <peer>}`
  - `{type:'peer-removed', reason}` — sent to a peer being removed; server then closes their WS. Triggered by host's `{type:'remove-peer', clientId: <peer>}`.
- **R2.5** Host-only WS commands the server validates (host = `isOwnerOf(roomId, ws.userEmail)`):
  - `{type:'meeting-ended-by-host'}` — server closes the meeting_session (`ended_reason='host-end'`), broadcasts `meeting-ended` to all admitted, then closes all WS in the room
  - `{type:'mute-target', clientId}` — server sends `mute-request` to that peer (peer's client honors by calling `MediaService.muteMic()`)
  - `{type:'remove-peer', clientId}` — server sends `peer-removed` to that peer + closes their socket + broadcasts `peer-left` to remaining admitted
- **R2.6** Non-host emitting any of the above commands → server drops silently (no-op, logged at info level for audit-via-stdout). No error message back to abusers.
- **R2.7** Helper `getHostClientId(roomId)`: returns the `clientId` of the currently-admitted host (where `userEmail === room.owner_email`), or null. Single source of truth — used by all host-action handlers.

## R3 — Frontend: app shell refactor

- **R3.1** Replace single `/dashboard` route with parent `/app` route + 4 child routes: `/app/rooms`, `/app/ongoing`, `/app/past`, `/app/recordings`. Add `/app/transcripts` + `/app/settings` route stubs (rendering "Coming in v2 Run 2") so the sidebar is shape-complete.
- **R3.2** Old `/dashboard` URL redirects to `/app/rooms` (preserves any external links).
- **R3.3** Layout: persistent collapsible left sidebar with nav links + topbar (brand + user email + Logout). Active route highlighted in sidebar. Density-light per existing UI standards. Dark theme baseline preserved.
- **R3.4** Auth guard moved to `/app/**` (replaces the per-page guard on /dashboard).

## R4 — Frontend: tabs + pagination

- **R4.1** **Rooms tab (`/app/rooms`)** — paginated list. Page size default 20, configurable via `?pageSize=` query param. UI shows current page + total + Prev/Next. Backend: `GET /api/rooms?page=&pageSize=` (extend existing endpoint backward-compat: returns `{rooms, page, pageSize, total}` when paginated, or legacy shape `{rooms}` when no page param).
- **R4.2** **Ongoing tab (`/app/ongoing`)** — calls `GET /api/meeting-sessions?status=active` every 5 seconds via Angular signal-driven `interval`. Renders each ongoing session: room title, started-at (relative time), admitted count, host email, "Join" link. Empty state: "No meetings in progress."
- **R4.3** **Past tab (`/app/past`)** — paginated. Calls `GET /api/meeting-sessions?status=ended&page=&pageSize=`. Renders: room title, started-at (full timestamp), duration (mm:ss or h:mm:ss), admitted_peak, recordings count (joined via filename roomId or sessionId).
- **R4.4** **Recordings tab (`/app/recordings`)** — moved from current dashboard section. Same list+download functionality. Paginated (size 20). Each row shows: filename, room title, size KB, uploaded-at, Download button.
- **R4.5** Create-room form remains accessible on the **Rooms tab** (preserves your #1 workflow).
- **R4.6** All paginated tabs persist `?page=` in the URL so refresh stays on the same page.

## R5 — Frontend: lobby device preview (Pattern X — pre-grant on mount)

- **R5.1** When `/room/:id` lobby state mounts (state = `lobby`), immediately call `navigator.mediaDevices.getUserMedia({audio:true, video: <camera checkbox>})`. Show browser permission prompt. Handle three permission outcomes: granted (R5.2), denied (R7.4 → error state), dismissed (treat as denied).
- **R5.2** Lobby view shows live preview of the local camera in a tile (or "Camera off" placeholder), plus mic-level meter (8 vertical bars, animated by RMS analyzer at 8Hz). Below: device selector dropdowns for microphone + camera (populated from `navigator.mediaDevices.enumerateDevices()`).
- **R5.3** Selecting a different mic or camera in the lobby triggers re-acquire of `getUserMedia` with the new `deviceId`. Update preview + meter live.
- **R5.4** "Test mic" button briefly records 1 second of mic then plays back through the speaker. (Not blocking — flag if too costly; could be just visual via the level meter.)
- **R5.5** Lobby Join button triggers room.page state transition to `connecting` (existing flow), but now passes the pre-acquired MediaStream forward — no second `getUserMedia` call.

## R6 — Frontend: in-call grid + per-tile overlays + meeting clock

- **R6.1** Replace `grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))` with a **dynamic grid driven by peer count**:
  - 1 peer: center the tile horizontally, max-width 720px, height auto via 16:9 aspect (NOT full-width stretch — closes the JROM screenshot complaint)
  - 2 peers: side-by-side, 50/50, max-width-each 50% of viewport
  - 3-4 peers: 2x2 grid
  - 5-9 peers: 3x3 grid
  - 10+ peers (won't happen at 8-cap but document): scrollable 3-column grid
  Implement as a CSS class set on `.tiles-grid` chosen by `[attr.data-count]="peers().length"`.
- **R6.2** Per-tile overlays (rendered by `<app-tile>`):
  - **Muted icon overlay** — bottom-right corner, small mic-off icon, visible when `peer.audioEnabled === false`. Audio-enabled state derived from the peer's incoming MediaStreamTrack's `enabled` property OR from a `mic-state` WS broadcast (decide: which is simpler? Lean: each peer broadcasts their own mic-state via WS when toggled; tiles render from that signal).
  - **Camera-off avatar** — when `peer.videoEnabled === false` (no video track or disabled), render the tile background as a centered circle with the peer's first letter (uppercase) on a hash-colored background derived from their name.
  - **Host badge** — small "HOST" pill in the bottom-left, visible only on the host's tile.
- **R6.3** Each peer (local + remote) broadcasts mic/cam state changes via NEW WS message `{type:'media-state', mic:bool, cam:bool}`. Server relays to all admitted peers as `{type:'media-state', clientId, mic, cam}`. Local peer's tile reflects its own state via the existing `MediaService` signals.
- **R6.4** Meeting elapsed-time clock in the call topbar: starts on entering `in-call` state, format `M:SS` under 60min, `H:MM:SS` over. Updates every second. Source: client-side timer started when state becomes `in-call` (acceptable drift; reset on reconnect).
- **R6.5** `tiles-grid` becomes a centered max-width container (max 1400px). On smaller viewports, falls back to 2-column then 1-column with media queries.

## R7 — Frontend: controls polish + recording banner + device failure UX

- **R7.1** Replace text-flip controls (`Mute`/`Unmute`, `Camera on`/`Camera off`) with **icon-state buttons**: single button per control, icon with on/off visual state (filled vs slashed). Hover tooltip shows action label. Keyboard-accessible (aria-pressed, focus ring).
- **R7.2** Record button is **visible only to host** (`isOwner()` signal). Non-hosts don't see it.
- **R7.3** "**Host is recording**" banner visible to **everyone** in the call when `recording-started` WS event has been received (and not yet `recording-stopped`). Red dot + text + duration (counts up from start). For host, the banner is the active record indicator (no separate indicator needed).
- **R7.4** **Device-failure states**:
  - Permission denied (mic OR camera): lobby (and in-call, if denial happens mid-call) shows clear error: "Microphone access denied — meet-poc can't join this call. Check browser settings → allow microphone for voice.silverjrom.app, then refresh." Include a "Retry" button that re-invokes `getUserMedia`.
  - No devices found (`enumerateDevices` returns no audioinput): "No microphone detected. Please connect a microphone and refresh." Camera-only is allowed (audio is required for meetings, but a meeting with no devices at all is not).
- **R7.5** Camera-off state in-call (user clicks Camera button to OFF): local tile shows the camera-off avatar (R6.2) instead of black video element. Remote peers' tiles also flip to avatar via the `media-state` broadcast.

## R8 — Frontend: participant sidebar + host actions + leave UX + active-speaker

- **R8.1** **Collapsible right-side participant sidebar** (replaces the floating `<app-waiting-room-panel>`). Toggle button in controls bar (people icon with count badge). When open, sidebar shows:
  - **"In the call" section** — every admitted peer with name + mic state icon + cam state icon + Host badge if applicable
  - **"Waiting to join" section** (host-only, hidden for non-hosts) — knockers with Admit / Reject buttons
- **R8.2** Each row in "In the call" section, for the host viewer, has a **kebab menu (⋮)** with actions:
  - **Mute participant** — sends `{type:'mute-target', clientId}` WS message (R2.5). Peer's client receives `mute-request` and calls `MediaService.muteMic()` + shows toast "Host muted you." (Non-blocking — peer can unmute themselves.)
  - **Remove from meeting** — sends `{type:'remove-peer', clientId}`. Server closes that peer's WS. (Hard kick — peer must re-knock to rejoin.)
- **R8.3** Host's own row: kebab disabled (no muting/removing self).
- **R8.4** **Leave button confirm dialog**:
  - **For host:** modal with two buttons: "End meeting for everyone" (primary, red) + "Leave but keep meeting going" (secondary). Cancel option (X close).
  - **For non-host:** no dialog — direct leave (existing behavior).
- **R8.5** **"End meeting for everyone" client-orchestrated flow** (Claude-peer critical catch):
  1. Disable both buttons; show "Finalizing…" spinner
  2. If `recorder.isRecording()`: `await recorder.stop()` → `await recorder.upload(blob, roomId)` with 8-second hard timeout (fall through to next step if upload exceeds)
  3. Send `{type:'meeting-ended-by-host'}` WS message
  4. Wait up to 1 second for the server's `meeting-ended` broadcast confirmation (otherwise just close the WS)
  5. Navigate to `/app/rooms`
  Document: if host's browser closes the tab DURING this flow, the partial recording blob may be lost (best-effort upload only). This is the accepted trade-off.
- **R8.6** When non-host peer receives `{type:'meeting-ended', reason}`: their UI shows a non-blocking modal "The host ended this meeting" with an OK button, 5-second auto-dismiss, then navigates to `/app/rooms` (if authed) or `/` (otherwise).
- **R8.7** **Active-speaker highlight**: a Web Audio `AnalyserNode` per remote MediaStream (8 max). RMS computed at 8 Hz (NOT 60 fps — explicitly throttled via `setInterval`, not `requestAnimationFrame`). The peer with the highest RMS above a threshold (e.g. -40 dBFS) gets a blue 3px ring on their tile. Single speaker at a time. Local speaker not highlighted (would just be noise to self).

---

## Open clarifications (none blocking — defaults locked)

| # | Question | Default applied |
|---|----------|-----------------|
| Q1 | Pattern X (pre-grant on lobby mount) vs Pattern Y (deferred to button click)? | **Pattern X** (Google Meet inspiration — JROM's verbatim brief reference); autonomous /projcore call |
| Q2 | "Test mic" button playback in lobby — costly to implement? | Optional polish; codex picks (button + recorder is ~30 LOC; OK to skip if Playwright fake-media complicates) |
| Q3 | Active-speaker threshold value (dBFS) | -40 dBFS; tunable later; log in decisions/ |
| Q4 | Past-meetings duration filter (10s) | 10s minimum to filter junk. Codex may adjust ±5s with logged decision |
| Q5 | Mic/cam state broadcast: client-broadcast vs server-stream-inference? | **Client-broadcast** via new `media-state` WS message; simpler and explicit |
| Q6 | Sidebar default state on mount | **Collapsed** by default; user opens manually |

If JROM disagrees with any default, raise before the batch dispatches.

---

## Hygiene rule (carried from v1 cleanup, now enforced)

**Playwright e2e suites MUST NOT pollute production SQLite.** Any test that creates rooms or recordings against the live PM2 backend MUST clean up its created entities in `afterEach` / `afterAll` hooks. Alternative: tests start their own backend with `MEET_DB_PATH=/tmp/<unique>.sqlite` (sandbox DB). Codex picks approach per batch + logs.
