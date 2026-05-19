# implementation-plan.md — meet-poc v2 Run 1

**Locked:** 2026-05-19. Contracts: `og-requirements.md` + `scenarios.md`. Architectural truth (post-v1): `project_specs.md` (will be updated incrementally).

**Implementer:** Codex (`$lead`) in tmux `lkvcdx-39`. JROM directive: continue the coordinate-with-codex pattern from v1.
**Coordinator:** Claude `/projcore`.
**Pattern:** 2 (supervisor-across-tmux). 3-call tmux send protocol.

---

## Branches

| Batch | Branch |
|-------|--------|
| B1 | `feat/meet-v2-b1-sessions-backend` |
| B2 | `feat/meet-v2-b2-host-authority` |
| B3 | `feat/meet-v2-b3-app-shell` |
| B4 | `feat/meet-v2-b4-tabs-pagination` |
| B5 | `feat/meet-v2-b5-lobby-preview` |
| B6 | `feat/meet-v2-b6-grid-overlays-clock` |
| B7 | `feat/meet-v2-b7-controls-banner-failure` |
| B8 | `feat/meet-v2-b8-sidebar-actions-leave-speaker` |

Each branch off the prior PASSED branch (B2 off B1, B3 off B2, etc.). No merge to main between batches; the chain lands as a unit at Phase 2 acceptance.

## Dependencies

```
B1 ──→ B2 ──→ B3 ──→ B4 ──→ B5 ──→ B6 ──→ B7 ──→ B8 ──→ Phase 2
                       │
                       └── B5 establishes MediaDevices plumbing
                            reused by B6 (tile rendering), B7 (device-failure UX),
                            B8 (active-speaker analyzer).
```

B1 (sessions) is consumed by B2 (recording binding) + B4 (Ongoing/Past tabs). B2 (WS messages) is consumed by B6 (media-state for tile overlays), B7 (recording-started/stopped for banner), B8 (mute-target / remove-peer / meeting-ended).

## Batches

(Per og-requirements.md and scenarios.md — see those for full surface. Implementation-plan rows are pointers + scope hard limits per batch.)

### B1 — Backend: meeting_sessions + lifecycle + paginated API
- **Req#:** R1.1-R1.6
- **Scenarios closed:** S1.1-S1.8
- **Likely files:** `backend/migrations/0003_meeting_sessions.sql` (new), `backend/src/modules/signaling/{index,sessions}.ts` (signaling adds session lifecycle hooks; new sessions helper module), `backend/src/modules/sessions/index.ts` (new — REST router), `backend/tests/sessions-*.test.ts` (new)
- **Tests:** vitest backend; WS clients exercise session lifecycle.
- **Scope hard limits:** no audit_events table (claude-peer drop). No `getHostClientId` use elsewhere yet — added but B2 wires consumers.

### B2 — Backend: host authority + recording binding
- **Req#:** R2.1-R2.7
- **Scenarios closed:** S2.1-S2.9
- **Likely files:** `backend/src/modules/recording/index.ts` (extend — auth + session-bound), `backend/src/modules/signaling/index.ts` (extend — new WS commands + broadcasts), `backend/src/modules/auth/middleware.ts` (extend if needed for upload), `backend/tests/recording.test.ts` + `signaling-host-actions.test.ts` (new)
- **Scope hard limits:** no FE changes; no new tables beyond B1's.

### B3 — Frontend: app shell refactor
- **Req#:** R3.1-R3.4
- **Scenarios closed:** S3.1-S3.4
- **Likely files:** `frontend/src/app/app.routes.ts` (replace dashboard with /app/* tree), `frontend/src/app/pages/app-shell/` (new layout component), `frontend/src/app/pages/transcripts-stub/` (new), `frontend/src/app/pages/settings-stub/` (new), `frontend/src/app/guards/auth.guard.ts` (move to /app/**). Old `dashboard.page` survives as child route content for `/app/rooms` (kept or refactored)
- **Tests:** Playwright e2e `tests/v2-b3-shell/`
- **Scope hard limits:** no new business logic; just routing + layout shell.

### B4 — Frontend: tabs + pagination
- **Req#:** R4.1-R4.6
- **Scenarios closed:** S4.1-S4.5
- **Likely files:** `frontend/src/app/pages/rooms/`, `frontend/src/app/pages/ongoing/`, `frontend/src/app/pages/past/`, `frontend/src/app/pages/recordings/` (split from dashboard), `frontend/src/app/services/{rooms,recordings,meeting-sessions}.service.ts` (extend with pagination + new sessions endpoint client). Backend: extend `GET /api/rooms` to accept `?page=&pageSize=` (backward compat — legacy callers without params get the old shape)
- **Tests:** Playwright `tests/v2-b4-tabs/`
- **Scope hard limits:** no Transcripts or Settings tab content (stubs are B3).

### B5 — Frontend: lobby device preview (Pattern X)
- **Req#:** R5.1-R5.5
- **Scenarios closed:** S5.1-S5.5
- **Likely files:** `frontend/src/app/pages/room/room.page.ts` (lobby state extension), `frontend/src/app/services/media.service.ts` (extend — pre-acquire + enumerateDevices + level meter analyzer), `frontend/src/app/components/lobby-preview/` (new — visual component), `frontend/src/app/components/mic-meter/` (new)
- **Tests:** Playwright `tests/v2-b5-lobby/`
- **Scope hard limits:** Test mic playback (R5.4) optional — codex picks + logs.

### B6 — Frontend: in-call grid + per-tile overlays + clock
- **Req#:** R6.1-R6.5
- **Scenarios closed:** S6.1-S6.6
- **Likely files:** `frontend/src/app/pages/room/room.page.html` + `.scss` (grid + clock topbar), `frontend/src/app/components/tile/` (extend — overlays + avatar), `frontend/src/app/services/{ws,media}.service.ts` (extend — media-state broadcast)
- **Tests:** Playwright `tests/v2-b6-grid/`
- **Scope hard limits:** No participant sidebar yet (B8). No active-speaker (B8).

### B7 — Frontend: controls polish + recording banner + device failure UX
- **Req#:** R7.1-R7.5
- **Scenarios closed:** S7.1-S7.5
- **Likely files:** `frontend/src/app/components/controls-bar/` (icon-state + host-gated Record), `frontend/src/app/components/recording-banner/` (new), `frontend/src/app/pages/room/room.page.ts` (subscribe to recording-started/stopped + permission errors), `frontend/src/app/services/media.service.ts` (extend — error states)
- **Tests:** Playwright `tests/v2-b7-controls/`
- **Scope hard limits:** Sidebar + active speaker stays in B8.

### B8 — Frontend: participant sidebar + host actions + leave UX + active-speaker
- **Req#:** R8.1-R8.7
- **Scenarios closed:** S8.1-S8.9
- **Likely files:** `frontend/src/app/components/participant-sidebar/` (new — replaces `waiting-room-panel`), `frontend/src/app/components/leave-dialog/` (new), `frontend/src/app/pages/room/room.page.ts` (orchestration), `frontend/src/app/services/{ws,webrtc,recorder}.service.ts` (extend — active-speaker analyzer + flush-on-end), `frontend/src/app/components/meeting-ended-toast/` (new)
- **Tests:** Playwright `tests/v2-b8-sidebar/`
- **Scope hard limits:** active-speaker analyzer throttled to 8Hz (explicit in brief).

## Test authority

- B1, B2: vitest backend OK unattended. ws-client test harness from rebuild B2 reused.
- B3-B8: Playwright targeted per-module (§2.10a). Two-context tests in B6, B7, B8 — costly, run deliberately.
- All e2e tests MUST clean up created rooms/recordings/sessions (hygiene rule, og-requirements end).

## Dispatch model

Per /projcore §1.8 + §2.9: per-batch brief at `prompts/batch-<n>.md`. Tmux dispatch with `$lead` persona switch. Callback to `progress.md` + `callbacks.md`. Commit before STATUS: DONE (rule carried from v1 B4 closure).

## Stop conditions

Per /projcore §1.18 — same as v1. The lobby device preview (B5) is the most likely to surface NEEDS-INFO (permission flows are browser-quirky); fast-fail to JROM if Playwright fake-media flags don't work as expected.

## Naming

Run folder: `plan/WK_0519/meet-v2/projcore-run-2026-05-19-v2/`.
Decision files: `decisions/2026-05-19-v2-b<n>-<slug>.md`.
Validation files: `validation/batch-<n>.md`.
