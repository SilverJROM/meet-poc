# req-matrix.md — meet-poc rebuild

Status meanings: `UNASSIGNED` → `ASSIGNED` (queued to a batch) → `IN-PROGRESS` (codex dispatched) → `CLAIMED` (codex callback STATUS: DONE) → `VERIFIED` (/projcore independent validation PASS) — or `FAIL` (sent back as correction).

**Final acceptance rule:** no requirement may remain UNASSIGNED, IN-PROGRESS, CLAIMED, or FAIL when the run is called complete.

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-----------------------------|-------|----------|--------|
| R1.1 | POST /api/login accepts {email,password}, sets HttpOnly cookie on success | B1 | — | ASSIGNED |
| R1.2 | GET /api/me returns user on auth, null on unauth | B1 | — | ASSIGNED |
| R1.3 | POST /api/logout invalidates session cookie | B1 | — | ASSIGNED |
| R1.4 | Passwords stored hashed with salt; plaintext never logged | B1 | — | ASSIGNED |
| R1.5 | Session TTL 30 days; expired sessions rejected and cleaned up | B1 | — | ASSIGNED |
| R1.6 | Single seeded user jrom@silverjrom.app via INITIAL_PASSWORD.txt | B1 | — | ASSIGNED |
| R1.7 | Failed/success login attempts logged with IP + masked/full email | B1 | — | ASSIGNED |
| R2.1 | Authenticated user creates a room via POST /api/rooms | B2 | — | ASSIGNED |
| R2.2 | GET /api/rooms returns user's rooms newest-first | B2 | — | ASSIGNED |
| R2.3 | DELETE /api/rooms/:id owner-only; 403 non-owner | B2 | — | ASSIGNED |
| R2.4 | GET /api/rooms/:id/exists public; returns {exists,title?} | B2 | — | ASSIGNED |
| R2.5 | Room IDs are random 12-hex strings | B2 | — | ASSIGNED |
| R3.1 | WebSocket /ws accepts join {room,name} | B2 | — | ASSIGNED |
| R3.2 | Owner auto-admitted on join; existing peers get peer-joined | B2 | — | ASSIGNED |
| R3.3 | Non-owner enters pending; owners receive knock | B2 | — | ASSIGNED |
| R3.4 | Owner admit/reject moves pending to admitted or closes socket | B2 | — | ASSIGNED |
| R3.5 | Admitted peers can send signal; backend relays to target | B2 | — | ASSIGNED |
| R3.6 | Disconnect emits peer-left to remaining admitted | B2 | — | ASSIGNED |
| R3.7 | Wire format preserved verbatim from current PoC | B2 | — | ASSIGNED |
| R3.8 | Room full at 8 admitted peers; 9th rejected with error | B2 | — | ASSIGNED |
| R4.1 | Angular 20 standalone SPA; no hidden-attribute panel toggling | B3 | — | ASSIGNED |
| R4.2 | Routes /login, /dashboard, /room/:id; auth guards | B3+B4 | — | ASSIGNED |
| R4.3 | Visual conventions match lokalcamp/frontend; density-light | B3+B4 | — | ASSIGNED |
| R4.4 | Login page with email/password/show-password toggle | B3 | — | ASSIGNED |
| R4.5 | Dashboard page with create-room form + room list | B3 | — | ASSIGNED |
| R4.6 | Room page lobby state with knock/cancel | B4 | — | ASSIGNED |
| R4.7 | Room page call state with tiles, controls, waiting-room | B4 | — | ASSIGNED |
| R4.8 | Stitched-panel symptom absent; no two panels simultaneously | B3+B4 | — | ASSIGNED |
| R5.1 | Full-mesh RTCPeerConnection to every admitted peer | B4 | — | ASSIGNED |
| R5.2 | ICE servers list includes STUN + coturn (final URL in B6) | B4+B6 | — | ASSIGNED |
| R5.3 | Mute, camera toggle, screen-share controls work | B4 | — | ASSIGNED |
| R5.4 | Connection state per peer visible | B4 | — | ASSIGNED |
| R5.5 | Non-blocking warning at 6 peers | B4 | — | ASSIGNED |
| R6.1 | Recording mixes local mic + every admitted peer's audio | B5 | — | ASSIGNED |
| R6.2 | MediaRecorder produces .webm; Record again stops & uploads | B5 | — | ASSIGNED |
| R6.3 | POST /upload writes recordings/<timestamp>_<slug>_<rand>.webm | B5 | — | ASSIGNED |
| R6.4 | Recording indicator + recordings list section on dashboard | B5 | — | ASSIGNED |
| R7.1 | coturn installed + running on this machine | B6 | — | ASSIGNED |
| R7.2 | coturn URL + creds in frontend ICE_SERVERS via env config | B6 | — | ASSIGNED |
| R7.3 | Configuration documented + committed under infra/coturn/ | B6 | — | ASSIGNED |
| R8.1 | PM2 ecosystem with meet-poc-be + meet-poc-fe | B1+B3 | — | ASSIGNED |
| R8.2 | Consolidated single-port serving via scripts/serve.js | B3 | — | ASSIGNED |
| R8.3 | CF Tunnel routes voice.silverjrom.app to new port | B6 | — | ASSIGNED |
| R8.4 | Old single-file meet-poc PM2 entry retired | B6 | — | ASSIGNED |
| R8.5 | Build pipeline produces deployable artifacts | B1+B3 | — | ASSIGNED |
| R9.1 | Playwright e2e under e2e/tests/ matching lokalcamp pattern | B3 | — | ASSIGNED |
| R9.2 | Per-batch scenarios written; tests use real DOM (no setContent) | B3-B6 | — | ASSIGNED |
| R9.3 | Two-context WebRTC tests with fake media flags | B4 | — | ASSIGNED |
| R9.4 | Per-module targeted runs first; full e2e sanity only | B3-B6 | — | ASSIGNED |
| R9.5 | Final acceptance: fresh-context validator at voice.silverjrom.app | Phase 2 | — | ASSIGNED |
| R10.1 | Pre-cutover recordings preserved | B6 | — | ASSIGNED |
| R10.2 | data.json users migrated into SQLite on first boot | B1 | — | ASSIGNED |
| R10.3 | Rollback path documented + dry-runnable | B6 | — | ASSIGNED |

**Totals as of B0 close:** 0 VERIFIED / 50 ASSIGNED / 0 FAIL.
