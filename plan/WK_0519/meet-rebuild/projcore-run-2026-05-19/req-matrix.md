# req-matrix.md — meet-poc rebuild

Status meanings: `UNASSIGNED` → `ASSIGNED` (queued to a batch) → `IN-PROGRESS` (codex dispatched) → `CLAIMED` (codex callback STATUS: DONE) → `VERIFIED` (/projcore independent validation PASS) — or `FAIL` (sent back as correction).

**Final acceptance rule:** no requirement may remain UNASSIGNED, IN-PROGRESS, CLAIMED, or FAIL when the run is called complete.

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-----------------------------|-------|----------|--------|
| R1.1 | POST /api/login accepts {email,password}, sets HttpOnly cookie on success | B1 | batch-1/scenarios-implemented.md S1.1 + live smoke | VERIFIED |
| R1.2 | GET /api/me returns user on auth, null on unauth | B1 | batch-1 S1.3 + live smoke | VERIFIED |
| R1.3 | POST /api/logout invalidates session cookie | B1 | batch-1 S1.4 + live smoke | VERIFIED |
| R1.4 | Passwords stored hashed with salt; plaintext never logged | B1 | batch-1 S1.5 + lib/passwords.ts review | VERIFIED |
| R1.5 | Session TTL 30 days; expired sessions rejected and cleaned up | B1 | batch-1 S1.6 + sessions.ts review + Max-Age=2592000 in smoke | VERIFIED |
| R1.6 | Single seeded user jrom@silverjrom.app via INITIAL_PASSWORD.txt | B1 | batch-1 + scripts/seed.ts review | VERIFIED |
| R1.7 | Failed/success login attempts logged with IP + masked/full email | B1 | batch-1 S1.2 + live smoke log capture | VERIFIED |
| R2.1 | Authenticated user creates a room via POST /api/rooms | B2 | batch-2 S2.1 + live smoke (POST /api/rooms → 12-hex id) | VERIFIED |
| R2.2 | GET /api/rooms returns user's rooms newest-first | B2 | batch-2 S2.3 + live smoke (GET /api/rooms newest-first) | VERIFIED |
| R2.3 | DELETE /api/rooms/:id owner-only; 403 non-owner | B2 | batch-2 S2.4 (own/403/404 all covered) | VERIFIED |
| R2.4 | GET /api/rooms/:id/exists public; returns {exists,title?} | B2 | batch-2 S2.5 + live smoke (public /exists) | VERIFIED |
| R2.5 | Room IDs are random 12-hex strings | B2 | batch-2 S2.1 (12-hex regex assertion) | VERIFIED |
| R3.1 | WebSocket /ws accepts join {room,name} | B2 | batch-2 S2.6+S2.7 (WS /ws accepts join) | VERIFIED |
| R3.2 | Owner auto-admitted on join; existing peers get peer-joined | B2 | batch-2 S2.6 + live smoke (owner auto-admit) | VERIFIED |
| R3.3 | Non-owner enters pending; owners receive knock | B2 | batch-2 S2.7 (non-owner pending + knock to owner) | VERIFIED |
| R3.4 | Owner admit/reject moves pending to admitted or closes socket | B2 | batch-2 S2.7+S2.8 (admit/reject) | VERIFIED |
| R3.5 | Admitted peers can send signal; backend relays to target | B2 | batch-2 S2.9 (signal relay) | VERIFIED |
| R3.6 | Disconnect emits peer-left to remaining admitted | B2 | batch-2 S2.10 (peer-left on disconnect) | VERIFIED |
| R3.7 | Wire format preserved verbatim from current PoC | B2 | batch-2 S2.12 + signaling-wire-format.test.ts Object.keys + live smoke | VERIFIED |
| R3.8 | Room full at 8 admitted peers; 9th rejected with error | B2 | batch-2 S2.11 (9th rejected with room full error) | VERIFIED |
| R4.1 | Angular 20 standalone SPA; no hidden-attribute panel toggling | B3 | batch-3 + Angular Router; no hidden-toggling — app.routes.ts uses canActivate guards | VERIFIED |
| R4.2 | Routes /login, /dashboard, /room/:id; auth guards | B3+B4 | B3 closed /login+/dashboard; B4 closes /room/:id full lobby+call states (room-placeholder deleted) | VERIFIED |
| R4.3 | Visual conventions match lokalcamp/frontend; density-light | B3+B4 | batch-3 dashboard/login screenshots show density-light dark theme matching lokalcamp | VERIFIED |
| R4.4 | Login page with email/password/show-password toggle | B3 | batch-3 S3.1 + login.page (#login-email, #login-password, show-password toggle, error inline) | VERIFIED |
| R4.5 | Dashboard page with create-room form + room list | B3 | batch-3 S3.4 + S3.7 + S3.8 + dashboard.page (topbar, create-room, room list, copy/join/delete) | VERIFIED |
| R4.6 | Room page lobby state with knock/cancel | B4 | batch-4 S4.1 + S4.4 (lobby + knock spinner + Cancel) | VERIFIED |
| R4.7 | Room page call state with tiles, controls, waiting-room | B4 | batch-4 S4.2+S4.4+S4.5+S4.6 (tiles, controls, owner waiting-room, leave) | VERIFIED |
| R4.8 | Stitched-panel symptom absent; no two panels simultaneously | B3+B4 | batch-3 S3.5 — input[type=email/password].toHaveCount(0) after auth (architectural closure of JROM stitched complaint) | VERIFIED |
| R5.1 | Full-mesh RTCPeerConnection to every admitted peer | B4 | batch-4 webrtc.service.ts:addPeer full-mesh; S4.3 two-context P2P green | VERIFIED |
| R5.2 | ICE servers list includes STUN + coturn (final URL in B6) | B4+B6 | batch-4 STUN configured in environment.ts; coturn injection extension point ready for B6 | PARTIAL |
| R5.3 | Mute, camera toggle, screen-share controls work | B4 | batch-4 S4.5 — mute/camera/screen-share toggles update track enabled flags via __meetDebug hook | VERIFIED |
| R5.4 | Connection state per peer visible | B4 | batch-4 S4.3 — app-tile .state shows peer.connectionState text "connected" both directions | VERIFIED |
| R5.5 | Non-blocking warning at 6 peers | B4 | batch-4 S4.8 — 6-peer warning banner appears when admitted-count reaches 6 | VERIFIED |
| R6.1 | Recording mixes local mic + every admitted peer's audio | B5 | — | ASSIGNED |
| R6.2 | MediaRecorder produces .webm; Record again stops & uploads | B5 | — | ASSIGNED |
| R6.3 | POST /upload writes recordings/<timestamp>_<slug>_<rand>.webm | B5 | — | ASSIGNED |
| R6.4 | Recording indicator + recordings list section on dashboard | B5 | — | ASSIGNED |
| R7.1 | coturn installed + running on this machine | B6 | — | ASSIGNED |
| R7.2 | coturn URL + creds in frontend ICE_SERVERS via env config | B6 | — | ASSIGNED |
| R7.3 | Configuration documented + committed under infra/coturn/ | B6 | — | ASSIGNED |
| R8.1 | PM2 ecosystem with meet-poc-be + meet-poc-fe | B1+B3 | B1 closes meet-poc-be; B3 closes meet-poc-fe (port 4710 via scripts/serve.js) | VERIFIED |
| R8.2 | Consolidated single-port serving via scripts/serve.js | B3 | batch-3 scripts/serve.js — /api+/ws+/upload → :4720, else → Angular :4711 / dist | VERIFIED |
| R8.3 | CF Tunnel routes voice.silverjrom.app to new port | B6 | — | ASSIGNED |
| R8.4 | Old single-file meet-poc PM2 entry retired | B6 | — | ASSIGNED |
| R8.5 | Build pipeline produces deployable artifacts | B1+B3 | batch-3 ng build + backend tsc produce deploy artifacts; final cutover pipeline in B6 | PARTIAL |
| R9.1 | Playwright e2e under e2e/tests/ matching lokalcamp pattern | B3 | batch-3 e2e/playwright.config.ts + tests/b3-shell-auth/ matches lokalcamp e2e pattern | VERIFIED |
| R9.2 | Per-batch scenarios written; tests use real DOM (no setContent) | B3-B6 | batch-3 grep "page.setContent" e2e/tests → no matches; all real-DOM | VERIFIED |
| R9.3 | Two-context WebRTC tests with fake media flags | B4 | batch-4 S4.3 + S4.4 use --use-fake-ui-for-media-stream + --use-fake-device-for-media-stream in playwright.config.ts | VERIFIED |
| R9.4 | Per-module targeted runs first; full e2e sanity only | B3-B6 | batch-3 codex ran npm test -w e2e -- tests/b3-shell-auth (targeted, not full) | VERIFIED |
| R9.5 | Final acceptance: fresh-context validator at voice.silverjrom.app | Phase 2 | — | ASSIGNED |
| R10.1 | Pre-cutover recordings preserved | B6 | — | ASSIGNED |
| R10.2 | data.json users migrated into SQLite on first boot | B1 | batch-1 S1.7 + live smoke (fresh temp DB picked up legacy hash) | VERIFIED |
| R10.3 | Rollback path documented + dry-runnable | B6 | — | ASSIGNED |

**Totals after B4 PASS (2026-05-19):** 39 VERIFIED / 11 ASSIGNED / 2 PARTIAL (R5.2, R8.5) / 0 FAIL. (53 reqs total.) Only B5+B6 scope remaining.

**Verification trail:**
- 2026-05-19 — B1 PASS — 7×R1 + R10.2 VERIFIED; R8.1 PARTIAL (BE entry done, FE deferred to B3). See `validation/batch-1.md`.
- 2026-05-19 — B2 PASS — R2.1-R2.5 + R3.1-R3.8 VERIFIED (13 reqs). Wire format identity verified at three levels (test file, source diff, live smoke). See `validation/batch-2.md`.
- 2026-05-19 — B3 PASS — 10 new VERIFIED (R4.1, R4.3, R4.4, R4.5, R4.8, R8.1 closed, R8.2, R9.1, R9.2, R9.4) + R4.2 PARTIAL (room-placeholder routes; full lobby/call → B4) + R8.5 PARTIAL (build artifacts exist; cutover pipeline → B6). S3.5 (stitched-panel absent) closes JROM's verbatim complaint at the requirements level. See `validation/batch-3.md`.
- 2026-05-19 — B4 PASS — 8 new VERIFIED (R4.2 closed, R4.6, R4.7, R5.1, R5.3, R5.4, R5.5, R9.3) + R5.2 PARTIAL (STUN done; coturn URL injection extension point → B6). Two-context P2P signaling verified in real fake-media browsers (S4.3 connected both ways). Soft-flag: codex left work uncommitted on STATUS: DONE callback; /projcore sent commit-only correction, codex closed in 2m 15s. See `validation/batch-4.md`.
