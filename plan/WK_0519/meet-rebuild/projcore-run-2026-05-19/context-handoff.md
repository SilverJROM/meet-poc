# context-handoff.md — meet-poc rebuild

Rolling handoff between batches. /projcore writes a new section here before each dispatch.

---

## Pre-B5 handoff (post-B4 PASS)

**HEAD:** `feat/meet-rebuild-b4-call-ui` (commit `5181f26 docs: update projcore run artifacts`)
**Branch for B5:** `feat/meet-rebuild-b5-recording` — off the B4 HEAD.

**What's in the repo now (post-B4):**
- `backend/` — TS workspace. Modules: auth, rooms, signaling. **No `recording` module yet** — B5 adds it.
- `frontend/` — Angular 20 SPA. Pages: login, dashboard (with placeholder Recordings section), room (lobby + call states). Services: auth, rooms, ws, webrtc, media. Components: tile, controls-bar (with disabled Record button), waiting-room-panel, knock-spinner.
- `e2e/` — tests/b3-shell-auth/ (8), tests/b4-call-ui/ (8). Fixtures: auth, rooms.
- `legacy-poc/` — original PoC at port 4700 still serving voice.silverjrom.app.
- `ecosystem.config.js` — legacy `meet-poc` (4700), `meet-poc-be` (4720), `meet-poc-fe` (4710).
- `recordings/` (gitignored) — directory at repo root, preserves legacy recordings per R10.1.

**API surface available (recap):**
- All B1+B2 REST + WS routes stable.
- `/upload` does NOT exist yet — B5 adds it.

**Reference logic to port** (B5 should read these to understand the mixing pattern, but rebuild idiomatically in Angular):
- `legacy-poc/public/client.js` — search for `MediaRecorder`, `AudioContext`, `dest`, `sourceFor` keywords. Legacy mixes local mic + every admitted peer's audio via `AudioContext.createMediaStreamDestination()` + per-peer `MediaStreamAudioSourceNode`.
- `legacy-poc/server.js:186-207` — `/upload` route shape: binary body, `X-Ext` + `X-Room` headers, writes to `recordings/<timestamp>_<roomSlug>_<rand>.webm`.

**What B5 must produce:**
- **Backend:** `backend/src/modules/recording/index.ts` with `POST /upload` (binary body, `X-Ext` + `X-Room` headers, no auth on the upload itself — anyone in a call can record; matches legacy). Plus `GET /api/recordings` (auth required) — returns recordings list for the authenticated user's rooms.
- **Optional backend table** `recordings` if codex chooses to track filename + size + roomId + uploadedAt + uploaderEmail (decision worth logging). Alternative: filesystem-only listing by `fs.readdirSync(recordings/)` with roomId parsed from filename — simpler, no migration. **Recommended:** filesystem-only for B5 (matches legacy); revisit if dashboard needs filtering or metadata.
- **Frontend:** `frontend/src/app/services/recorder.service.ts` — AudioContext mix logic + MediaRecorder lifecycle. `start(localStream, remoteStreams)` / `stop() → Blob` / upload via fetch POST to `/upload`.
- **Frontend:** wire the Record button in `controls-bar` (currently disabled with title="Recording lands in B5") to call recorder service. Show recording indicator while active.
- **Frontend:** dashboard `Recordings` placeholder section fills with the recording list (filename + size + download link), polled or refreshed on dashboard mount.
- **E2E:** Playwright specs covering S5.1, S5.2, S5.3. S5.3 (audio mix includes peer track) needs `ffprobe` (or a small `wav`-stream byte check) to verify audio is present in the .webm.

**Standing flags:**
- §2.10 validator discipline — real DOM, real `MediaRecorder` in fake-media Chromium where possible
- §2.10a targeted-first
- §1.15 decisions/2026-05-19-b5-<slug>.md for each non-trivial autonomous call
- **NEW for B5 (added per B4 soft-flag closure):** **Commit before posting STATUS: DONE callback.** Don't post the callback line until `git status` is clean.

**Decisions already locked:**
- Recording is client-side mix; server is dumb upload sink (matches legacy)
- Local-disk only (no R2; we said no Cloudflare)
- Recordings preserved across cutover (R10.1)

**Live service status:** legacy `meet-poc` on :4700 still serves `voice.silverjrom.app`. Untouched.

**Active callback target:** `projcore-run-2026-05-19/callbacks.md` + `progress.md`.
