# Codex consult — meet-poc v2 (meeting UI overhaul + admin authority + tabs + pagination + transcripts)

**From:** Claude `/projcore` (same session that just closed the rebuild run 2026-05-19)
**To:** Codex in tmux `lkvcdx-39`, cwd `~/websites/meet-poc`
**Purpose:** validate my gap list, weigh in on architecture for a substantial follow-up. **No code yet** — coming back to JROM with joint plan first.

---

## 1. JROM's verbatim ask (2026-05-19)

> "ok i see the meet poc app, lets make this better
> 1. have a pagination on the meeting list
> 2 the meeting ui is trash as seen here [screenshot of /room/<id> with one wide-letterboxed tile + minimal controls]. please fix this. have a better UI on the participant list, allowing joins, etc copy google meet for inspiration on this.
> 4. main window have a side bar and tabs to better show the past meetings, ongoing, recordings, and transcripts, settings on how to read it.
> 5. the admin is the only one who can record the meeting and have the admin have authority to set the meeting off when he leave it,
> and give me other gaps i miight have missed here"

(JROM's numbering skipped 3 — treating as a typo.)

Live URL: `https://voice.silverjrom.app`. Stack as of yesterday's run: Angular 20 SPA + TS Express + better-sqlite3 + raw WS signaling + full-mesh P2P + client-side AudioContext recording. Single user (jrom@silverjrom.app). 49/53 reqs VERIFIED per `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/`.

## 2. JROM's 6 explicit asks (decomposed)

| # | Ask | Current state | New state |
|---|-----|---------------|-----------|
| 1 | Pagination on meeting list | Dashboard's `rooms-panel` renders ALL rooms in one ul | Pagination (page size 10-20) OR infinite-scroll; pick one + log |
| 2 | Better in-call meeting UI à la Google Meet | `tiles-grid` is `repeat(auto-fit, minmax(260px, 1fr))` — 1 tile stretches full-width with 16:9 aspect → wide horizontal band. Controls all in one row. No participant list sidebar. | Google-Meet-style: dynamic grid (1:center+letterbox, 2:side-by-side, 3-4:2x2, 5-9:3x3...), participant sidebar, host-controls per participant, mic/cam icon overlays, camera-off avatar (initials), active-speaker highlight, meeting elapsed-time |
| 3 | _(skipped in JROM's numbering — folded into #2)_ | | |
| 4 | Main window: sidebar + tabs (past meetings / ongoing / recordings / transcripts / settings) | Dashboard is a single grid (create-room + rooms-list + recordings-list). No tabs. No "past meetings" concept. No transcripts. | Sidebar nav: Ongoing meetings, Rooms (the current "rooms list"), Past meetings (new — meeting sessions table), Recordings, Transcripts, Settings |
| 5 | Admin-only recording | Anyone in the call sees Record button (B5 trade-off). | Recording button visible ONLY to host; backend `/upload` adds auth check (or signed token) — must be host of the active room |
| 5b | Admin ends meeting on leave | If owner leaves, room state empties silently; non-owner participants stay until they leave individually | Owner Leave triggers `meeting-ended-by-host` broadcast → all admitted peers see "Meeting ended" + auto-disconnect + redirect to /dashboard. Optional: confirm dialog "Leave or End meeting for all?" |

## 3. Gaps I see beyond JROM's list (curated, not exhaustive — flag whichever you'd add/remove)

### A. Meeting-flow gaps

- **A1 — Lobby preview (Google Meet's "Ready to join?")** — before clicking Join/Ask-to-join, show mic+camera preview, mic level meter, device selector. Big UX win.
- **A2 — Meeting-session entity** — currently a "room" persists but a "meeting session" (one occurrence of people gathering) doesn't exist. Without sessions, "Past meetings" tab can only show rooms (not occurrences) and "Recordings linked to a meeting" is impossible. Suggest: new `meeting_sessions` table (id, room_id, started_at, ended_at, ended_by_email, participant_count_peak). Created when first peer admits; closed when last peer leaves OR host ends. Recordings get `meeting_session_id` FK.
- **A3 — Meeting-ended UX** — when host ends, non-host peers see `[meeting ended by host]` toast + 5s countdown then redirect; current rebuild has no such broadcast.
- **A4 — Re-admit fast path** — if a previously-admitted user disconnects + reconnects within 30s, re-admit silently (skip knock). Optional polish.
- **A5 — Host transfer** — if host needs to leave but wants meeting to continue, can transfer host to another participant. (Probably out of scope — flag as future.)

### B. In-call UI gaps (Google Meet parity)

- **B1 — Tile layout dynamic grid** — current `auto-fit minmax(260px, 1fr)` is wrong for 1-2 participants (stretches awkwardly). Need:
  - 1 participant: center, max-width capped, 16:9 letterboxed
  - 2: side-by-side, 50/50
  - 3-4: 2x2 grid
  - 5-9: 3x3
  - 10+: scrollable grid + speaker-focus mode
- **B2 — Active-speaker highlight** — blue ring around the tile of whoever is talking (via audio-level analysis on each remote stream, NOT WebRTC stats which are slow).
- **B3 — Per-tile overlays** — mic muted icon, camera-off avatar (user initials in a circle), connection-quality dot.
- **B4 — Participant sidebar (R-side panel)** — collapsible, shows: name + mic-state + cam-state + admit/reject (for knockers) + host-actions (mute, remove). Toggle button in controls bar.
- **B5 — Active-state controls** — current Mute button text flips ("Mute" ↔ "Unmute"). Convention is one icon button with on/off visual state. Same for camera/screen/record.
- **B6 — Meeting clock** — "00:42:13" elapsed time in topbar.
- **B7 — Pin participant** — click a tile to pin it as main; others go to thumbnail strip. (Probably v2.5.)
- **B8 — Self-view options** — hide self / minimize / mirror.

### C. Permissions / admin gaps

- **C1 — Recording is host-only (JROM #5)** — UI hides button; backend `/upload` rejects non-host. Need: signed upload token issued by backend at "Record start" time (host-only API call), validated on `/upload`. OR: tie /upload to session cookie + room.ownerEmail match.
- **C2 — Mute another participant** — host clicks "mute" next to a name → backend emits `mute-request` to that peer → their `MediaService.toggleMic()` is called. Suggest soft (request) not hard (kick track), with notification ("Host muted you").
- **C3 — Remove participant** — host clicks "remove" → backend closes that peer's WS + broadcasts peer-left.
- **C4 — Host badge** — visible "Host" pill next to host's name on every surface.

### D. Main-app gaps (sidebar + tabs — JROM #4)

- **D1 — Routing layout shift** — current `/dashboard` is single-page. Need to refactor to layout component with router-outlet + sidebar nav with router links: `/app/ongoing`, `/app/rooms`, `/app/past`, `/app/recordings`, `/app/transcripts`, `/app/settings`. (Or keep `/dashboard` as the parent with child routes.)
- **D2 — Ongoing meetings** — "show me which rooms have active calls right now." Need backend: `/api/meeting-sessions?status=active` reading the live `liveRooms` map.
- **D3 — Past meetings** — `/api/meeting-sessions?status=ended` from the sessions table.
- **D4 — Recordings tab** — already exists as a section on dashboard; promote to its own route.
- **D5 — Transcripts tab** — new. Each recording can have an associated transcript. (See section E below.)
- **D6 — Settings tab** — JROM mentioned "settings on how to read [the transcript]". Interpretation: transcript display settings — language, speaker labels on/off, word-level timestamps on/off. Possibly also: recording quality, default device.

### E. Transcripts (JROM #4)

This is the most ambiguous ask. Options:

- **E-opt-A — Server-side post-call Whisper.cpp** — when a recording's `.webm` upload finishes, kick off a local Whisper.cpp transcription job. Result stored as `transcripts/<recording-filename>.json` (segments w/ timestamps) + `.srt`. Offline, free, ~realtime-on-CPU for small models. **Recommended.**
- **E-opt-B — Browser Web Speech API live captions** — Chrome's built-in `SpeechRecognition`. Free, real-time, but Chrome-only + no speaker diarization + no batch reprocessing.
- **E-opt-C — Cloud (Deepgram / AssemblyAI / Whisper API)** — best quality + diarization, but costs money + needs API key.

**Codex Q1:** which one? My recommendation is **E-opt-A (Whisper.cpp local)** for the same "host on my machine, no cloud" energy as JROM's coturn decision. Open-source binary, model ~150MB-1.5GB depending on size, single-user fine.

### F. Misc gaps

- **F1 — Active-speaker detection via Web Audio API** — analyzer node on each remote stream → compute RMS → set "speaking" signal per peer. Used by B2.
- **F2 — Toasts/notifications** — knock arrived, host muted you, peer joined/left, recording started. Lightweight component.
- **F3 — Keyboard shortcuts** — Ctrl/⌘+D mute, Ctrl/⌘+E camera, Ctrl/⌘+P pin (later). Standard Google Meet.
- **F4 — Mobile responsive** — out of scope for this batch but worth a "future" tag.
- **F5 — Tab title shows participant count** — `(3) Team Sync — meet-poc` when in a meeting.

## 4. Architectural questions for codex

**Q2 — Meeting-session entity timing.** Should `meeting_sessions` row be created on first admit (a real call has started) or on first owner join (a "meeting" was opened)? Pro-first-admit: cleaner data, no empty sessions. Pro-first-owner-join: easier to track "host arrived" timestamp. My lean: **first admit**.

**Q3 — Admin-only recording enforcement.** Two paths:
- Path-A: backend `/upload` checks session cookie → resolves user → checks `rooms.owner_email === user.email`. Add `requireOwnership` middleware that takes `X-Room` header.
- Path-B: signed upload token. Host hits `POST /api/recordings/token { roomId }` → gets short-lived JWT → uploads with `Authorization: Bearer <token>`. Cleaner for future multi-host; overkill for single-user.

My lean: **Path-A**. Simpler. The legacy "unauthenticated /upload" trade-off (decisions/2026-05-19-b5-upload-auth-tradeoff.md) gets reversed.

**Q4 — Sidebar shell.** Should the sidebar route shell live at `/app/*` (refactor) or replace `/dashboard` as the parent (keep current routes, add sub-routes)? My lean: **rename `/dashboard` → `/app` with child routes** `/app/ongoing /app/rooms /app/past /app/recordings /app/transcripts /app/settings`. Old `/dashboard` redirects to `/app/ongoing`.

**Q5 — Whisper.cpp pipeline.** If we go E-opt-A:
- One-time: install whisper.cpp + download model (~150MB tiny.en for speed; or small.en for quality)
- Backend: on `POST /upload` success, enqueue a job (BullMQ? simple FS-queue dir?). Simple FS-queue: drop a `.pending` sibling file next to the `.webm`, a node-side watcher picks it up, runs `whisper-cli --output-json`, writes `<recording>.transcript.json`, deletes `.pending`. No external service.
- Frontend: transcripts tab polls `/api/transcripts` (or includes them in `/api/recordings`).

**Q6 — Real-time presence for "Ongoing meetings".** Two approaches:
- Snapshot: `/api/meeting-sessions?status=active` reads in-memory `liveRooms` per-call. Stale up to refresh interval (~5s).
- Push: a separate WS namespace `/admin-ws` that pushes presence changes. Overkill for single-user.
My lean: **snapshot with 5s poll**.

**Q7 — Scope for one /projcore run vs split.** This is a big surface — maybe 8-10 batches total:
- B1 — Backend: `meeting_sessions` table + lifecycle (open on first admit, close on last leave or host-end) + APIs (`/api/meeting-sessions?status=`).
- B2 — Backend: host-only `/upload` enforcement + `kick`/`mute-request` signaling messages + `meeting-ended-by-host` broadcast.
- B3 — Frontend: app shell refactor (`/app/*` sidebar layout) + route children stubs.
- B4 — Frontend: dashboard pagination + Ongoing tab + Past meetings tab + Recordings tab (promote existing).
- B5 — Frontend: in-call dynamic grid + per-tile overlays (mute, cam-off avatar, active-speaker ring) + meeting clock.
- B6 — Frontend: participant sidebar + host-controls per participant (mute, remove, end-for-all).
- B7 — Frontend: lobby preview (mic/cam test) + reactions/raise-hand (optional).
- B8 — Backend + Frontend: Whisper.cpp transcript pipeline + Transcripts tab + Settings tab (transcript display options).

Should we do all 8 in one /projcore run, or break it into 2-3 runs? My lean: **one run, 8 batches**, since they're tightly coupled (FE depends on BE in several places).

## 5. What I need from you

Reply ending with `STATUS: APPROVE | REVISE — <reason> | NEEDS-INFO — <question>`. Tight reply preferred.

Specifically:
- Agree with Whisper.cpp local + Path-A enforcement + session-on-first-admit + /app/* sidebar shell?
- Anything in my gap list (A1-F5) you'd ADD or DROP?
- Anything you'd RE-ORDER or MERGE in the 8-batch plan?
- Any gotcha I missed?

— Claude /projcore
