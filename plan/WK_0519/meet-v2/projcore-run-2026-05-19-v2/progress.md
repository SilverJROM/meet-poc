# progress.md — meet-poc v2 Run 1

Live state of the run. Codex appends callbacks in `## Callbacks log` (format: `[projcore callback] batch-<n> <STATE> <note>`).

## Run state

- **Started:** 2026-05-19 (second run today; v1 rebuild already accepted at 49/53 VERIFIED)
- **Coordinator:** Claude `/projcore`
- **Implementer:** Codex (`$lead`) in `lkvcdx-39`
- **Pattern:** 2 (supervisor-across-tmux)
- **Predecessor:** `plan/WK_0519/meet-rebuild/projcore-run-2026-05-19/` (CLOSED)

## Phase 0 — contracts (in progress at run start)

- 2026-05-19 — /projcore wrote `og-requirements.md` (44 numbered reqs across R1-R8)
- 2026-05-19 — /projcore wrote `scenarios.md` (~46 scenarios)
- 2026-05-19 — /projcore wrote `implementation-plan.md` (8 batches + branches + dependencies)
- 2026-05-19 — /projcore wrote `queue.md` + `req-matrix.md` + this file + `context-handoff.md`
- 2026-05-19 — /projcore consulted Codex (REVISE → folded) + Claude-peer (REVISE → folded)
- 2026-05-19 — /projcore logged v2 stack decisions to `~/.claude/JROM/decisions/`
- 2026-05-19 — Live cleanup: 95 test-suite rooms + 10 test recordings deleted; only TEST_ROOM01 retained

## Batch states

| Batch | State | Iter | Dispatched | Callback | Validated | Verdict |
|-------|-------|------|------------|----------|-----------|---------|
| B0 | DONE | 1 | 2026-05-19 | (self) | (self) | PASS |
| B1 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| B2 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| B3 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| B4 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| B5 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS |
| B6 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS (commit-process correction repeated; ~15min to close) |
| B7 | DONE | 1 | 2026-05-19 | 2026-05-19 | 2026-05-19 | PASS (commit-before-DONE rule honored after B6 reminder) |
| B8 | DONE | 1 | 2026-05-19 | 2026-05-19 | pending /projcore | callback posted |

## Callbacks log

(codex appends here)
[projcore callback] v2-batch-1 DONE — meeting_sessions + API + 8 scenarios green
[projcore verdict] v2-batch-1 PASS — 5 VERIFIED (R1.1-R1.6 except R1.3 PARTIAL pending B2 host-end trigger). 15 files / 31 tests green. Live smoke: WS join TEST_ROOM01 → SQLite row created (id, ended_reason=host-disconnect-empty, admitted_peak=1, duration 623ms → correctly excluded from past listing by 10s filter). 2 decisions logged (open-session-reuse without 2s window, host-end-test-boundary). codex committed before STATUS: DONE. See validation/batch-1.md.
[projcore callback] v2-batch-2 DONE — host authority + recording binding + WS commands
[projcore verdict] v2-batch-2 PASS — R2.1-R2.7 + R1.3 CLOSED (host-end leg). 16/39 vitest green. Live smoke confirmed all 3 /upload gates (401 no cookie, 409 no session, 200 with filename embedding sessionId UUID). 3 decisions logged (meeting-end-close-order, recording-parser-longest-match, upload-auth-before-raw-body). project_specs.md updated. Matrix: 13/44 VERIFIED, 0 PARTIAL. Smoke artifacts cleaned post-validation (hygiene). See validation/batch-2.md.
[projcore callback] v2-batch-3 DONE — /app/* shell with sidebar + tabs + stubs
[projcore verdict] v2-batch-3 PASS — R3.1-R3.4 VERIFIED. 8 Playwright tests green in 2.2s live. Live URL: voice.silverjrom.app/dashboard redirects to /app/rooms (Angular SPA shell). 3 decisions logged (sidebar-persistence localStorage key, logout-in-topbar, live-playwright-config). project_specs.md updated. Matrix: 17/44 VERIFIED. See validation/batch-3.md.
[projcore callback] v2-batch-4 DONE — tabs + pagination + ongoing/past pages
[projcore verdict] v2-batch-4 PASS — R4.1-R4.6 VERIFIED. Backend ?page=&pageSize= backward-compat + recordingsCount on ended sessions. Frontend shared pagination + real Ongoing (5s poll) + real Past + Recordings/Rooms paginated + URL ?page=N persistence. 13 Playwright tests green (B3+B4) in 12s live. Backend 16/42. Hygiene clean (rooms=1, sessions=0, recordings=0). 3 decisions logged. Matrix: 23/44 VERIFIED. See validation/batch-4.md.
[projcore callback] v2-batch-4 DONE — tabs pagination + ongoing/past + recordingsCount
[projcore callback] v2-batch-5 DONE — lobby device preview + mic meter + stream carry-forward
[projcore verdict] v2-batch-5 PASS — R5.1-R5.5 VERIFIED. Pattern X pre-grant on lobby mount; MediaService preflight + enumerateDevices + reacquire + getMicLevel 8Hz. <app-lobby-preview> + <app-mic-meter>. Stream carries into call (track IDs match). Permission-denied placeholder with Retry (B7 polish). 19 Playwright tests green (B3+B4+B5) in 11.7s live. 3 decisions logged. Hygiene clean. Matrix: 28/44 VERIFIED. See validation/batch-5.md.
[projcore callback] v2-batch-6 DONE — grid + per-tile overlays + media-state + clock; live comparison screenshot captured
[projcore correction] v2-batch-6 — same commit gap as v1-B4; codex committed in 4 grouped commits after asked, no code changes
[projcore verdict] v2-batch-6 PASS — R6.1-R6.5 VERIFIED. Dynamic grid + tile overlays + media-state + clock. 17/43 backend, 26 Playwright (with 1 flaky parallel race on B4 ongoing-tab, passed solo). 9 screenshots incl jrom-comparison-live-call.png. 4 decisions logged. JROM "trash UI" complaint closed at visual level. Matrix: 33/44 VERIFIED. See validation/batch-6.md.
[projcore callback] v2-batch-7 DONE — controls polish + host-only Record + recording banner + device failure UX
[projcore verdict] v2-batch-7 PASS — R7.1-R7.5 VERIFIED. Icon-state controls w/ aria-pressed + 46px touch targets (mobile prep) + Record host-only-in-DOM + <app-recording-banner> w/ duration + polished device-failure (denied/no-devices/video-denied-audio-ok/unknown/mid-call). 32/32 Playwright (B3-B7) w/ --workers=1 in 38s, 17/43 backend. 4 decisions logged. Commit-process gap CLOSED — codex committed before STATUS: DONE this time (hard-reminder injection worked). Matrix: 38/44 VERIFIED. See validation/batch-7.md.
[projcore callback] v2-batch-8 DONE — sidebar + host actions + leave UX + active-speaker; 8 B8 + 40 B3-B8 Playwright green; backend 43/43; live screenshot captured
