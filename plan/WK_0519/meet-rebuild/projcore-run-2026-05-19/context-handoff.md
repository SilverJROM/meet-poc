# context-handoff.md — meet-poc rebuild

Rolling handoff between batches. /projcore writes a new section here before each dispatch.

---

## Pre-B4 handoff (post-B3 PASS)

**HEAD:** `feat/meet-rebuild-b3-angular-shell` (commit `e4f898f docs: add batch 3 evidence artifacts`)
**Branch for B4:** `feat/meet-rebuild-b4-call-ui` — codex creates off the B3 HEAD.

**What's in the repo now (post-B3):**
- `backend/` — TS workspace; `npm run build` clean; `cd backend && npm test` → 12 files / 19 tests green. **No backend changes in B4** unless absolutely required (B5 owns `/upload`; signaling protocol is locked in B2 and is the surface B4 consumes).
- `frontend/` — Angular 20 standalone SPA. Pages: `login` (B3), `dashboard` (B3, with empty Recordings section placeholder for B5), `room-placeholder` (B3 stub — **B4 replaces this**).
- `scripts/serve.js` — consolidated proxy at :4710. `/api/*` + `/upload` + `/ws` (WS upgrade) → `:4720`; else → Angular dev :4711 (or `dist/` in prod).
- `e2e/` — Playwright workspace; `tests/b3-shell-auth/` — 8 scenarios green. `playwright.config.ts` already has fake-media browser flags ready for B4.
- `ecosystem.config.js` — three entries: legacy `meet-poc` (:4700, untouched), `meet-poc-be` (:4720), `meet-poc-fe` (:4710).
- `plan/.../projcore-run-2026-05-19/` — req-matrix at **31 VERIFIED / 20 ASSIGNED / 2 PARTIAL / 0 FAIL** (53 total). batch-1 / batch-2 / batch-3 artifacts complete. 6 decision files logged.

**API surface available to B4 (locked, see context-handoff pre-B3 for full list):**
- All B1+B2 routes stable. The WebSocket protocol at `/ws` is the workhorse for B4.

**WebSocket protocol B4 must speak to (from legacy + B2 implementation):**

Client → server:
- `{type:'join', room, name}` — first message after WS open; server uses session cookie for owner detection
- `{type:'signal', to, data}` — admitted peers only; relays `data` to peer `to`
- `{type:'admit', clientId}` — owner only
- `{type:'reject', clientId, reason?}` — owner only

Server → client:
- `{type:'admitted', clientId, peers, roomTitle, isOwner}` — peers = [{id,name}, …]
- `{type:'knocking', clientId, roomTitle}` — guest in pending state
- `{type:'knock', clientId, name}` — to owners
- `{type:'pending-list', knockers}` — to owner on owner-join when pending already exist
- `{type:'peer-joined', clientId, name}` — to existing admitted on new admission
- `{type:'peer-left', clientId}` — to remaining admitted on disconnect
- `{type:'knock-cancelled', clientId}` — to owners
- `{type:'signal', from, data}` — relayed peer-to-peer signaling payload
- `{type:'rejected', reason}` — to the rejected guest; then socket closes
- `{type:'error', error}` — for `room not found`, `room full (max 8)`, etc.

**What B4 must produce:**
- Replace `frontend/src/app/pages/room-placeholder/` with real `frontend/src/app/pages/room/` containing **lobby state** + **call state** (single page that conditionally renders based on internal call state — both rendered by the SAME Angular component, not separate routes; transition via component state, not URL change).
- New services: `WsService` (WS connection lifecycle), `WebrtcService` (per-peer `RTCPeerConnection` bookkeeping), `MediaService` (`getUserMedia` + `getDisplayMedia` lifecycle).
- New components under `frontend/src/app/components/`: `tile`, `controls-bar`, `waiting-room-panel`, `knock-spinner`.
- Playwright B4 specs under `e2e/tests/b4-call-ui/` covering S4.1–S4.8. **Two-context spec (S4.3, S4.4) runs once per validation cycle — not in tight iteration loop.**

**Standing flags (carry forward):**
- §2.10 validator discipline — Playwright must use real DOM, no `setContent` smell.
- §2.10a per-module targeted-first; B4's two-context P2P tests are costly — run them deliberately, not in every cycle.
- §1.15 — write `decisions/2026-05-19-b4-<slug>.md` for each non-trivial autonomous call. R5.5 warning threshold (6 peers) — straightforward. R5.4 connection state display — choice of "implicit via tile presence" vs explicit indicator is a judgement call worth logging.

**Decisions already locked (do not re-litigate):**
- Stack: Angular 20 + signals; REST via HttpClient for room/auth; raw `WebSocket` (native browser API, NOT a library) for `/ws`
- Full-mesh P2P — every admitted peer opens an `RTCPeerConnection` to every other
- ICE_SERVERS: STUN now; coturn added in B6 (B4 leaves a clearly-marked extension point)
- Room cap 8 (soft warning at 6)
- Recording = B5 (NOT B4); record button can exist as a UI element but is disabled or shows "coming soon" until B5

**Live service status:** legacy `meet-poc` on :4700 still serves `voice.silverjrom.app`. Untouched.

**Active callback target:** `projcore-run-2026-05-19/callbacks.md` + `progress.md`.
