# req-matrix.md — meet-poc v2 Run 1

Status meanings: `ASSIGNED` → `IN-PROGRESS` → `CLAIMED` → `VERIFIED` (or `FAIL`).

**Final acceptance rule:** no row may remain `ASSIGNED`/`IN-PROGRESS`/`CLAIMED`/`FAIL` when the run is called complete.

| Req# | Requirement (first 80 chars) | Batch | Evidence | Status |
|------|-----------------------------|-------|----------|--------|
| R1.1 | meeting_sessions table + indexes via migration 0003 | B1 | — | ASSIGNED |
| R1.2 | Session opens on first WS-join, idempotent within room | B1 | — | ASSIGNED |
| R1.3 | Session closes on host-end / last-peer-left / host-disconnect-empty | B1 | — | ASSIGNED |
| R1.4 | admitted_peak tracked as high-water mark | B1 | — | ASSIGNED |
| R1.5 | GET /api/meeting-sessions paginated; active and ended-with-filter | B1 | — | ASSIGNED |
| R1.6 | Helper getOpenSessionFor(roomId, hostEmail) | B1 | — | ASSIGNED |
| R2.1 | /upload cookie-trust + 401/403 | B2 | — | ASSIGNED |
| R2.2 | /upload 409 if no open meeting_session for (room, host) | B2 | — | ASSIGNED |
| R2.3 | Recording filename embeds meeting_session_id (backward compat) | B2 | — | ASSIGNED |
| R2.4 | WS broadcasts: recording-started/stopped, meeting-ended, mute-request, peer-removed | B2 | — | ASSIGNED |
| R2.5 | Host-only WS commands: meeting-ended-by-host, mute-target, remove-peer | B2 | — | ASSIGNED |
| R2.6 | Non-host commands dropped silently with info-level log | B2 | — | ASSIGNED |
| R2.7 | Helper getHostClientId(roomId) | B2 | — | ASSIGNED |
| R3.1 | /app/{rooms,ongoing,past,recordings,transcripts,settings} routes + stubs | B3 | — | ASSIGNED |
| R3.2 | /dashboard redirects to /app/rooms | B3 | — | ASSIGNED |
| R3.3 | Layout: persistent collapsible sidebar + topbar + active state | B3 | — | ASSIGNED |
| R3.4 | Auth guard at /app/** | B3 | — | ASSIGNED |
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

**Totals at run start (2026-05-19):** 0 VERIFIED / 44 ASSIGNED / 0 PARTIAL / 0 FAIL.
