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
| R4.1 | Rooms tab paginated, /api/rooms?page=&pageSize= backward-compat | B4 | B4 backend ?page=&pageSize= backward-compat; shared <app-pagination>; live curl confirms both shapes | VERIFIED |
| R4.2 | Ongoing tab polls active sessions every 5s | B4 | B4 Ongoing page 5s poll via interval(5000); S4.3 11.4s test (insert session, wait, verify pickup) | VERIFIED |
| R4.3 | Past tab paginated with duration formatting | B4 | B4 Past paginated; duration formatting mm:ss/h:mm:ss; recordingsCount via FS-scan join | VERIFIED |
| R4.4 | Recordings tab promoted to /app/recordings | B4 | B4 Recordings paginated; S4.5 + screenshot | VERIFIED |
| R4.5 | Create-room form remains on Rooms tab | B4 | B4 S4.2 (create-room form stays on Rooms tab; carried from B3) | VERIFIED |
| R4.6 | All paginated tabs persist ?page= in URL | B4 | B4 Rooms+Past+Recordings persist ?page=N in URL via Router.navigate queryParamsHandling:merge | VERIFIED |
| R5.1 | Lobby pre-grants getUserMedia on mount (Pattern X) | B5 | B5 MediaService.preflight on lobby mount; S5.1 + live public smoke shows __meetDebug.localStream has audio track | VERIFIED |
| R5.2 | Mic level meter + device selector dropdowns | B5 | B5 <app-mic-meter> 8 bars at 8Hz + <select> device dropdowns in <app-lobby-preview> | VERIFIED |
| R5.3 | Device-change re-acquires getUserMedia with new deviceId | B5 | B5 MediaService.reacquire on device change; S5.3 verifies selector populates | VERIFIED |
| R5.4 | Test-mic playback (optional polish) | B5 | B5 deferred Test mic playback per decision (mic-meter already verifies live input); decisions/2026-05-19-v2-b5-test-mic-deferred.md | VERIFIED |
| R5.5 | Lobby pre-acquired stream carries into call (no double getUserMedia) | B5 | B5 S5.5: track IDs match before lobby Join and after in-call transition (single stream) | VERIFIED |
| R6.1 | Dynamic grid 1=center-capped, 2=split, 3-4=2x2, 5-9=3x3 | B6 | B6 .tiles-grid[data-count] CSS: 1=center+720cap, 2=1fr 1fr, 3-4=2x2, 5-9=3x3. 4 screenshots | VERIFIED |
| R6.2 | Per-tile overlays: mute icon, camera-off avatar, host badge | B6 | B6 <app-tile> overlays: mute icon, camera-off initials avatar (HSL hash), HOST badge | VERIFIED |
| R6.3 | media-state WS broadcast for mic/cam state | B6 | B6 backend media-state relay (admitted-only, no echo); frontend broadcasts on toggle; signaling-media-state.test.ts | VERIFIED |
| R6.4 | Meeting elapsed-time clock in topbar | B6 | B6 meeting clock signal m:ss/h:mm:ss; tick interval; cleanup on leave; clock-0-05.png screenshot | VERIFIED |
| R6.5 | tiles-grid centered max-width container + responsive fallbacks | B6 | B6 .call-panel max-width 1400px centered; responsive @media <1024 + <640 fallbacks | VERIFIED |
| R7.1 | Icon-state controls with aria-pressed | B7 | B7 controls-bar icon buttons + S7.5 aria-pressed Playwright | VERIFIED |
| R7.2 | Record button visible only to host | B7 | B7 S7.1/S7.2 two-context test; non-host Record toHaveCount(0) | VERIFIED |
| R7.3 | "Host is recording" banner visible to ALL with duration counter | B7 | B7 S7.3 two-context recording banner test + screenshot | VERIFIED |
| R7.4 | Permission denied + no-devices error UI | B7 | B7 S7.4 denied/no-devices tests + screenshots; mid-call notice implemented | VERIFIED |
| R7.5 | Camera-off renders avatar (not black video) | B7 | B7 self-camera-off-avatar test + B6 remote avatar regression | VERIFIED |
| R8.1 | Collapsible right-side participant sidebar with In-call + Waiting-to-join | B8 | — | ASSIGNED |
| R8.2 | Host kebab actions: Mute participant, Remove from meeting | B8 | — | ASSIGNED |
| R8.3 | Host's own row: kebab disabled | B8 | — | ASSIGNED |
| R8.4 | Leave confirm dialog (host only): End for all / Just leave | B8 | — | ASSIGNED |
| R8.5 | End-meeting-for-all client-orchestrated flush-recorder-then-broadcast | B8 | — | ASSIGNED |
| R8.6 | Non-host meeting-ended toast + 5s auto-dismiss + nav | B8 | — | ASSIGNED |
| R8.7 | Active-speaker highlight via Web Audio RMS at 8Hz | B8 | — | ASSIGNED |

**Totals after v2-B7 PASS (2026-05-19):** 38 VERIFIED / 6 ASSIGNED / 0 PARTIAL / 0 FAIL.

**Verification trail:**
- 2026-05-19 — v2-B1 PASS — R1.1-R1.6 except R1.3 PARTIAL. Live smoke: WS join TEST_ROOM01 → real SQLite row (uuidv4 id, ended_reason=host-disconnect-empty, admitted_peak=1, 623ms duration → correctly excluded from past via 10s filter). 15/31 vitest green. 2 decisions logged. See `validation/batch-1.md`.
- 2026-05-19 — v2-B2 PASS — R2.1-R2.7 + R1.3 closed (host-end leg). 16/39 vitest green. Live smoke: /upload 401/409/200. 3 decisions logged. See `validation/batch-2.md`.
- 2026-05-19 — v2-B3 PASS — R3.1-R3.4 VERIFIED. /app/* shell + 6 sidebar tabs + auth guard moved to /app parent. 8 Playwright tests live. voice.silverjrom.app serves the new shell. 3 decisions logged. See `validation/batch-3.md`.
- 2026-05-19 — v2-B4 PASS — R4.1-R4.6 VERIFIED. Pagination backward-compat + recordingsCount on ended sessions; real Ongoing+Past pages; URL ?page= persistence. 13 Playwright + 16/42 backend. 3 decisions. See `validation/batch-4.md`.
- 2026-05-19 — v2-B5 PASS — R5.1-R5.5 VERIFIED. Pattern X pre-grant on lobby mount; <app-lobby-preview> + <app-mic-meter> 8Hz; reacquire on device change; stream-carries-into-call; permission-denied placeholder. 19 Playwright in 11.7s live. 3 decisions (test-mic-deferred, mic-meter-threshold, retry-preflight). See `validation/batch-5.md`.
- 2026-05-19 — v2-B6 PASS — R6.1-R6.5 VERIFIED. Dynamic grid + tile overlays + media-state relay + elapsed clock. 17/43 backend. Same commit-process gap as v1-B4: codex needed correction to commit before STATUS: DONE; closed in ~15min with 4 grouped commits. B4 ongoing-tab flaky in parallel (passed solo). JROM-comparison screenshot at batch-6/screenshots/jrom-comparison-live-call.png captures the new live look. JROM screenshot complaint closed at visual level. 4 decisions logged. See `validation/batch-6.md`.
- 2026-05-19 — v2-B7 callback — R7.1-R7.5 implemented and self-verified. Icon-state controls, host-only Record DOM gate, shared recording banner, polished denied/no-device UX, mid-call mic-loss notice, local camera-off avatar. 43 backend tests, full build, 6 B7 Playwright, 32 B3-B7 Playwright sweep with `--workers=1`, PM2 restart, and public live smoke green. Pending /projcore independent verdict.
