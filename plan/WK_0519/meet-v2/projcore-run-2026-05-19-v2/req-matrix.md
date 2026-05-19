# req-matrix.md — meet-poc v2 Run 1

Status meanings: `ASSIGNED` → `IN-PROGRESS` → `CLAIMED` → `VERIFIED` (or `FAIL`).

**Final acceptance rule:** no row may remain `ASSIGNED`/`IN-PROGRESS`/`CLAIMED`/`FAIL` when the run is called complete.

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-----------------------------|-------|----------|--------|
| R1.1 | meeting_sessions table + indexes via migration 0003 | B1 | B1 0003_meeting_sessions.sql; 15/31 tests green | VERIFIED |
| R1.2 | Session opens on first WS-join, idempotent within room | B1 | B1 S1.1 + live smoke (WS open creates row, idempotent reuse for same room) | VERIFIED |
| R1.3 | Session closes on host-end / last-peer-left / host-disconnect-empty | B1 | B1 closed last-peer-left + host-disconnect-empty; B2 closes host-end (S2.6 + sessions-lifecycle regression) | VERIFIED |
| R1.4 | admitted_peak tracked as high-water mark | B1 | B1 S1.2 (admitted_peak high water mark) | VERIFIED |
| R1.5 | GET /api/meeting-sessions paginated; active and ended-with-filter | B1 | B1 S1.6+S1.7+S1.8 + live smoke (active=0 + ended paginated with 10s+peak filter) | VERIFIED |
| R1.6 | Helper getOpenSessionFor(roomId, hostEmail) | B1 | B1 store.ts getOpenSessionFor + getOpenSessionByRoom helpers | VERIFIED |
| R2.1 | /upload cookie-trust + 401/403 | B2 | B2 S2.1 + live smoke 401 (no cookie) + 403 (non-owner) | VERIFIED |
| R2.2 | /upload 409 if no open meeting_session for (room, host) | B2 | B2 S2.3 + live smoke 409 (cookie ok, no open session) | VERIFIED |
| R2.3 | Recording filename embeds meeting_session_id (backward compat) | B2 | B2 S2.4 + live smoke: new filename <ts>_<sessionId>_<roomId>_<slug>_<rand>.webm; backward-compat parser | VERIFIED |
| R2.4 | WS broadcasts: recording-started/stopped, meeting-ended, mute-request, peer-removed | B2 | B2 S2.5 (recording-started/stopped), S2.6 (meeting-ended), S2.7 (mute-request), S2.8 (peer-removed) | VERIFIED |
| R2.5 | Host-only WS commands: meeting-ended-by-host, mute-target, remove-peer | B2 | B2 S2.5-S2.8 all four host-only commands work; close-order documented in decisions/meeting-end-close-order.md | VERIFIED |
| R2.6 | Non-host commands dropped silently with info-level log | B2 | B2 S2.9 non-host commands produce info logs + no broadcasts | VERIFIED |
| R2.7 | Helper getHostClientId(roomId) | B2 | B1 added/exported getHostClientId(roomId); B2 first uses it indirectly via isOwnerOf | VERIFIED |
| R3.1 | /app/{rooms,ongoing,past,recordings,transcripts,settings} routes + stubs | B3 | B3 /app/* parent + 6 children (rooms, ongoing-stub, past-stub, recordings, transcripts-stub, settings-stub); S3.3 confirms stubs | VERIFIED |
| R3.2 | /dashboard redirects to /app/rooms | B3 | B3 /dashboard → /app/rooms redirect; S3.2 + live curl https://voice.silverjrom.app/dashboard | VERIFIED |
| R3.3 | Layout: persistent collapsible sidebar + topbar + active state | B3 | B3 collapsible sidebar with 6 nav links + topbar + active state via routerLinkActive; localStorage memory; 4 screenshots | VERIFIED |
| R3.4 | Auth guard at /app/** | B3 | B3 authGuard moved to /app parent; S3.4 verifies /app/rooms + /app/ongoing both redirect to /login when unauthed | VERIFIED |
| R4.1 | Rooms tab paginated, /api/rooms?page=&pageSize= backward-compat | B4 | — | ASSIGNED |
| R4.2 | Ongoing tab polls active sessions every 5s | B4 | — | ASSIGNED |
| R4.3 | Past tab paginated with duration formatting | B4 | — | ASSIGNED |
| R4.4 | Recordings tab promoted to /app/recordings | B4 | — | ASSIGNED |
| R4.5 | Create-room form remains on Rooms tab | B4 | — | ASSIGNED |
| R4.6 | All paginated tabs persist ?page= in URL | B4 | — | ASSIGNED |
| R5.1 | Lobby pre-grants getUserMedia on mount (Pattern X) | B5 | — | ASSIGNED |
| R5.2 | Mic level meter + device selector dropdowns | B5 | — | ASSIGNED |
| R5.3 | Device-change re-acquires getUserMedia with new deviceId | B5 | — | ASSIGNED |
| R5.4 | Test-mic playback (optional polish) | B5 | — | ASSIGNED |
| R5.5 | Lobby pre-acquired stream carries into call (no double getUserMedia) | B5 | — | ASSIGNED |
| R6.1 | Dynamic grid 1=center-capped, 2=split, 3-4=2x2, 5-9=3x3 | B6 | — | ASSIGNED |
| R6.2 | Per-tile overlays: mute icon, camera-off avatar, host badge | B6 | — | ASSIGNED |
| R6.3 | media-state WS broadcast for mic/cam state | B6 | — | ASSIGNED |
| R6.4 | Meeting elapsed-time clock in topbar | B6 | — | ASSIGNED |
| R6.5 | tiles-grid centered max-width container + responsive fallbacks | B6 | — | ASSIGNED |
| R7.1 | Icon-state controls with aria-pressed | B7 | — | ASSIGNED |
| R7.2 | Record button visible only to host | B7 | — | ASSIGNED |
| R7.3 | "Host is recording" banner visible to ALL with duration counter | B7 | — | ASSIGNED |
| R7.4 | Permission denied + no-devices error UI | B7 | — | ASSIGNED |
| R7.5 | Camera-off renders avatar (not black video) | B7 | — | ASSIGNED |
| R8.1 | Collapsible right-side participant sidebar with In-call + Waiting-to-join | B8 | — | ASSIGNED |
| R8.2 | Host kebab actions: Mute participant, Remove from meeting | B8 | — | ASSIGNED |
| R8.3 | Host's own row: kebab disabled | B8 | — | ASSIGNED |
| R8.4 | Leave confirm dialog (host only): End for all / Just leave | B8 | — | ASSIGNED |
| R8.5 | End-meeting-for-all client-orchestrated flush-recorder-then-broadcast | B8 | — | ASSIGNED |
| R8.6 | Non-host meeting-ended toast + 5s auto-dismiss + nav | B8 | — | ASSIGNED |
| R8.7 | Active-speaker highlight via Web Audio RMS at 8Hz | B8 | — | ASSIGNED |

**Totals after v2-B3 PASS (2026-05-19):** 17 VERIFIED / 27 ASSIGNED / 0 PARTIAL / 0 FAIL.

**Verification trail:**
- 2026-05-19 — v2-B1 PASS — R1.1-R1.6 except R1.3 PARTIAL. Live smoke: WS join TEST_ROOM01 → real SQLite row (uuidv4 id, ended_reason=host-disconnect-empty, admitted_peak=1, 623ms duration → correctly excluded from past via 10s filter). 15/31 vitest green. 2 decisions logged. See `validation/batch-1.md`.
- 2026-05-19 — v2-B2 PASS — R2.1-R2.7 + R1.3 closed (host-end leg). 16/39 vitest green. Live smoke: /upload 401/409/200. 3 decisions logged. See `validation/batch-2.md`.
- 2026-05-19 — v2-B3 PASS — R3.1-R3.4 VERIFIED. /app/* shell + 6 sidebar tabs + auth guard moved to /app parent. 8 Playwright tests live. voice.silverjrom.app serves the new shell. 3 decisions logged. See `validation/batch-3.md`.
