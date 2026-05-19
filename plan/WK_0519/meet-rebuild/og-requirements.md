# og-requirements.md — meet-poc rebuild (WK_0519)

**Locked:** 2026-05-19 by JROM via /projcore intake conversation
**Mode:** autonomous-complete (JROM-validated final smoke)
**This is the contract.** Every batch gate anchors here. Final acceptance only when every Req row reads VERIFIED.

---

## Scope statement

Rebuild the meet-poc app at `~/websites/meet-poc/` from a single-file Express + vanilla-JS prototype into an Angular SPA + TypeScript Node backend, deployed at the existing `https://voice.silverjrom.app` via the existing CF Tunnel.

**In scope:** auth, room CRUD, real-time WebRTC signaling, full-mesh P2P media up to 8 peers, browser-side recording with local upload, knock/admit lobby flow, owner waiting-room panel, coturn TURN server on this machine.

**Out of scope (explicit):** Cloudflare Workers / D1 / R2 / Durable Objects (JROM excluded the CF backend stack). Multi-user / invites (single seeded user `jrom@silverjrom.app` only). SFU / media server (full-mesh P2P only). Mobile-optimized UI (responsive desktop primary). E2E encryption beyond WebRTC's DTLS-SRTP. Apollo / GraphQL on the FE.

---

## R1 — Auth (single user, session cookie)

- **R1.1** Backend exposes `POST /api/login` accepting `{email, password}` JSON; returns 200 with `Set-Cookie: session=<token>; HttpOnly; Path=/; SameSite=Lax; Secure (when HTTPS)` on success, 401 otherwise.
- **R1.2** Backend exposes `GET /api/me` returning `{user: {email}}` for authenticated sessions, `{user: null}` for unauthenticated.
- **R1.3** Backend exposes `POST /api/logout` invalidating the session cookie.
- **R1.4** Passwords are stored hashed (scrypt or bcrypt) with per-user salt; plaintext is never logged.
- **R1.5** Session TTL = 30 days; expired sessions are rejected and cleaned up.
- **R1.6** Single seeded user `jrom@silverjrom.app`. Seeding via `npm run seed` reads initial password from `INITIAL_PASSWORD.txt` if present (preserving current PoC behavior).
- **R1.7** Failed login attempts log to backend stdout with IP + masked email; success logs with email + IP.

## R2 — Room CRUD (owner-only)

- **R2.1** Authenticated user can create a room via `POST /api/rooms` with `{title}`; backend returns `{room: {id, title, ownerEmail, createdAt}}`.
- **R2.2** `GET /api/rooms` returns rooms owned by the authenticated user, newest-first.
- **R2.3** `DELETE /api/rooms/:id` deletes a room owned by the authenticated user; returns 403 for non-owners, 404 for non-existent rooms.
- **R2.4** `GET /api/rooms/:id/exists` is public (no auth) and returns `{exists: bool, title?: string}` — used by the lobby to display room title before join.
- **R2.5** Room IDs are random 12-hex-char strings.

## R3 — Signaling protocol (WebSocket, knock/admit)

- **R3.1** Backend exposes a WebSocket endpoint (e.g. `/ws`) that accepts a `join {room, name}` message.
- **R3.2** If the connecting user owns the room: they are admitted immediately, receive `admitted {clientId, peers[], roomTitle, isOwner: true}`, and existing admitted peers receive `peer-joined {clientId, name}`.
- **R3.3** If the connecting user does NOT own the room: they enter pending state, receive `knocking {clientId, roomTitle}`, and all room owners receive `knock {clientId, name}`.
- **R3.4** Owner can send `admit {clientId}` or `reject {clientId, reason?}` — backend moves the pending peer to admitted (with full `peer-joined` broadcast) or closes their socket with `rejected {reason}`.
- **R3.5** All admitted peers can send `signal {to, data}` — backend relays as `signal {from, data}` to the target peer.
- **R3.6** When a peer disconnects, remaining admitted peers receive `peer-left {clientId}`.
- **R3.7** Wire format is preserved verbatim from the current PoC so transition is incremental.
- **R3.8** Soft cap: backend rejects `join` once a room has 8 admitted peers with `{type: 'error', error: 'room full (max 8)'}` and closes the socket. Frontend displays the message.

## R4 — Frontend SPA (Angular 20)

- **R4.1** Frontend is an Angular 20+ standalone-component SPA with routing. No `hidden` attribute toggling that depends on CSS specificity to hide.
- **R4.2** Routes: `/login`, `/dashboard`, `/room/:id` (lobby + call). Unauthenticated access to `/dashboard` redirects to `/login`; authenticated access to `/login` redirects to `/dashboard`. `/room/:id` is reachable both authenticated and unauthenticated (guest joiners use any name).
- **R4.3** Visual conventions match `~/websites/lokalcamp/frontend/` (Ionic + signals + dark theme cohesion). Density-light per JROM/style/priorities.md.
- **R4.4** Login page: email + password + show-password toggle + Sign-in button; error messages displayed inline.
- **R4.5** Dashboard page: header (brand + email + Logout), Create-Room form, room list with title/created/share-URL/copy-link/Join/Delete actions.
- **R4.6** Room page (lobby state): when arriving at `/room/:id`, user sees room title + name field + optional "start with camera on" + Ask-to-join button (or auto-admit when owner). Knock state shows spinner + Cancel.
- **R4.7** Room page (call state): tile grid of participants, controls bar (mute, camera toggle, share screen, record, leave), owner-only waiting-room panel listing knockers with admit/reject buttons, recording indicator.
- **R4.8** **The stitched-panel symptom from the current PoC must be absent** — no two panels (login / dashboard / lobby / call) visible simultaneously at any time. Verified by Playwright DOM assertions in B3/B4 scenarios.

## R5 — WebRTC client (full-mesh P2P, up to 8)

- **R5.1** Client opens an `RTCPeerConnection` to every other admitted peer (full-mesh).
- **R5.2** ICE servers list includes Google STUN + the coturn URL from B6.
- **R5.3** Mute toggles the local mic track; camera toggle enables/disables the video track; screen share replaces video with a `getDisplayMedia` stream and reverts on stop.
- **R5.4** Connection state per peer is displayed (or implicit via tile presence).
- **R5.5** Frontend displays a non-blocking warning when admitted-peer count reaches 6 ("Calls with more than 6 participants may be unstable on this stack").

## R6 — Recording (client-side mix, server upload)

- **R6.1** Recording mixes local mic + every admitted peer's audio into a single stream via `AudioContext`.
- **R6.2** `MediaRecorder` produces a `.webm` (Opus codec); pressing Record again stops and uploads.
- **R6.3** Upload via `POST /upload` with binary body + `X-Ext: webm` + `X-Room: <roomId>` headers; backend writes to `recordings/<timestamp>_<roomSlug>_<rand>.webm`.
- **R6.4** Recording indicator visible while active. Recordings list section on dashboard surfaces saved files for the authenticated user (basic — filename + size + download link).

## R7 — TURN server (coturn on this machine)

- **R7.1** coturn installed and configured on `minisserver` (the local machine), running as a systemd service or PM2-managed process per JROM preference at install time.
- **R7.2** coturn URL + credentials baked into the frontend `ICE_SERVERS` list at build time (env-config, not hardcoded across files).
- **R7.3** Configuration documented in `project_specs.md` § Deployment + coturn config file committed under `infra/coturn/`.

## R8 — Process / deployment

- **R8.1** PM2 ecosystem.config.js exposes two apps: `meet-poc-be` (TypeScript backend, `tsx watch` in dev / `node dist/server.js` in prod) and `meet-poc-fe` (`scripts/serve.js` proxy that fronts Angular dev server in dev / serves built Angular `dist/` in prod).
- **R8.2** Consolidated single-port serving (e.g. backend listens on 4700, frontend dev server on 4701, `scripts/serve.js` proxies `/api/*` + `/ws` + `/upload` to backend and all else to frontend, listening on 4710 — final port TBD in B1).
- **R8.3** CF Tunnel re-pointed to the consolidated port at the start of B6. App reachable at `https://voice.silverjrom.app`.
- **R8.4** Old single-file `server.js` is retired (PM2 entry `meet-poc` removed); old code preserved in git history.
- **R8.5** Build pipeline: `npm run build` at repo root builds backend (`tsc`) + frontend (`ng build`), produces deployable artifacts.

## R9 — Testing & validation

- **R9.1** Playwright e2e under `e2e/tests/` using `playwright.config.ts` (lokalcamp pattern). Headless chromium. baseURL = consolidated dev URL.
- **R9.2** Per-batch scenarios written by /projcore as `scenarios.md` (per-batch evidence-quality contract). Test source must use real DOM (`page.goto`, `page.click`, `locator()`) — not `page.setContent` static-HTML smells (§2.10 validator discipline).
- **R9.3** Two-context WebRTC tests use Playwright's `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` flags.
- **R9.4** Per-module targeted Playwright runs are the iteration loop; full e2e is final sanity check only (§2.10a).
- **R9.5** Final acceptance gate: fresh-context independent validator opens `https://voice.silverjrom.app`, exercises every Req# end-to-end, returns PASS/FAIL per Req# with one-line evidence.

## R10 — Cutover safety

- **R10.1** B6 cutover preserves all current `recordings/*.webm` files (no destructive cleanup).
- **R10.2** Current `data.json` users are migrated into the new SQLite DB on first boot if SQLite DB is empty (or via explicit `npm run migrate-from-json`). The seeded user must remain `jrom@silverjrom.app` with the same password.
- **R10.3** Rollback path: revert PM2 ecosystem.config.js + restart old `meet-poc` entry. Documented in `project_specs.md` § Rollback.

---

## Open clarifications (none blocking — defaults locked)

| # | Question | Default applied |
|---|----------|-----------------|
| Q1 | Apollo/GraphQL on FE? | NO — REST + HttpClient (autonomous /projcore call, JROM/decisions logged) |
| Q2 | better-sqlite3 vs other SQLite lib? | better-sqlite3 (synchronous, simple, default for Node) |
| Q3 | JWT vs session cookie? | Session cookie (matches current PoC; simpler with single-server SPA) |
| Q4 | Angular Ionic vs vanilla Angular Material? | Ionic (matches lokalcamp/frontend) |
| Q5 | Final consolidated port number? | 4710 — locked in B1 unless conflicts exist |

If JROM disagrees with any default, raise it before that batch dispatches.
