# implementation-plan.md — meet-poc rebuild

**Locked:** 2026-05-19. Spec: `og-requirements.md`. Scenarios: `scenarios.md`. Architecture: `../../../project_specs.md`.

**Implementer:** Codex (`$lead`) in tmux `lkvcdx-39`. JROM directive 2026-05-19: *"give the implementation to codex and you validate"*.
**Coordinator:** Claude `/projcore` (this session).
**Pattern:** 2 (supervisor-across-tmux). 3-call tmux send protocol.

---

## Branching

Each batch runs on its own feature branch off `main` (or `master`, whichever the repo settles on at B1):

| Batch | Branch |
|-------|--------|
| B1 | `feat/meet-rebuild-b1-backend-foundation` |
| B2 | `feat/meet-rebuild-b2-rooms-signaling` |
| B3 | `feat/meet-rebuild-b3-angular-shell` |
| B4 | `feat/meet-rebuild-b4-call-ui` |
| B5 | `feat/meet-rebuild-b5-recording` |
| B6 | `feat/meet-rebuild-b6-coturn-cutover` |

`meet-poc` is currently NOT a git repo (per env `Is a git repository: false`). **B1 includes `git init` + initial commit of legacy state** before introducing the new structure.

## Dependencies

- B1 blocks B2, B3
- B2 blocks B4
- B3 blocks B4
- B4 blocks B5
- B5 blocks B6
- B0 (contract — this writeup) blocks B1

Diagram:
```
B0 ──┬─→ B1 ─┬─→ B2 ─┐
     │      └─→ B3 ─┴─→ B4 ─→ B5 ─→ B6
     └─ (this plan + scenarios + req-matrix)
```

## Batches

### B0 — Contract lock (/projcore writes this; no implementation)
- **Artifacts:** `og-requirements.md`, `scenarios.md`, `project_specs.md`, `implementation-plan.md`, `projcore-run-2026-05-19/queue.md`, `req-matrix.md`, `progress.md`, `context-handoff.md`
- **Decisions logged:** `~/.claude/JROM/decisions/2026-05-19-meet-poc-rebuild-stack.md`, `~/.claude/JROM/decisions/2026-05-19-meet-poc-rest-not-graphql.md`
- **Closed by:** /projcore — no dispatch needed.
- **Status:** IN PROGRESS (Phase 0 of this run).

### B1 — Backend foundation
- **Req#:** R1.1-R1.7, R8.1, R8.2, R10.2
- **Likely files:** `backend/{src/server.ts, src/db.ts, src/modules/auth/*, src/lib/cookies.ts, migrations/0001_init.sql}`, `backend/package.json`, `backend/tsconfig.json`, `scripts/{seed.ts, migrate-from-json.ts}`, root `package.json` (workspaces), `ecosystem.config.js` (add `meet-poc-be`), `legacy-poc/` (move old code here), root `git init` + first commit
- **Scope:** TS scaffold; SQLite schema (`users`, `sessions`); auth routes; session-cookie middleware; seed script; migrate-from-json script; root workspaces. **No room CRUD, no ws, no FE yet.**
- **Scenarios closed:** S1.1, S1.2, S1.3, S1.4, S1.5, S1.6, S1.7
- **Tests:** vitest backend unit + integration tests under `backend/tests/`. No Playwright yet (no FE).
- **Acceptance:** all S1.x green; backend builds clean (`tsc --noEmit`); seeded user reachable via `curl`; legacy `data.json` users migrated.

### B2 — Rooms API + signaling (raw WS)
- **Req#:** R2.1-R2.5, R3.1-R3.8
- **Likely files:** `backend/src/modules/{rooms/*, signaling/*}`, `backend/migrations/0002_rooms.sql`, `backend/tests/{rooms.test.ts, signaling.test.ts}`
- **Scope:** room CRUD routes; ws endpoint at `/ws`; knock/admit protocol; signal relay; 8-peer soft cap; preserve legacy wire format.
- **Scenarios closed:** S2.1-S2.12
- **Tests:** vitest with `ws` client harness for protocol-level two-client tests.
- **Acceptance:** all S2.x green; ws message shapes byte-identical to legacy `server.js` for the 6 message types.

### B3 — Angular shell + auth + dashboard
- **Req#:** R4.1, R4.2 (login/dashboard slices), R4.3, R4.4, R4.5, R4.8, R8.1 (`meet-poc-fe` PM2 entry + `scripts/serve.js`)
- **Likely files:** `frontend/` (Angular CLI scaffold), `frontend/src/app/{pages/login, pages/dashboard, services/auth.service.ts, services/rooms.service.ts}`, `frontend/src/app/app.routes.ts`, `scripts/serve.js`, `ecosystem.config.js` (add `meet-poc-fe`)
- **Scope:** Angular 20 standalone scaffold; routing with auth guards; login + dashboard pages; room CRUD UI via HttpClient; visual style aligned to lokalcamp; `scripts/serve.js` proxy.
- **Scenarios closed:** S3.1-S3.8 (S3.5 is the explicit stitched-symptom closer)
- **Tests:** Playwright e2e under `e2e/tests/b3-shell-auth/`. Consolidated dev URL must be reachable.
- **Acceptance:** all S3.x green; stitched symptom verified absent (S3.5).

### B4 — Call UI + WebRTC client
- **Req#:** R4.2 (`/room/:id`), R4.6, R4.7, R5.1-R5.5
- **Likely files:** `frontend/src/app/pages/room/{lobby, call, tile, waiting-room}`, `frontend/src/app/services/{ws.service.ts, webrtc.service.ts, room.service.ts}`
- **Scope:** lobby panel (knock state + cancel), call panel (tiles + controls + waiting-room admit), WebRTC peer-connection bookkeeping, room-full enforcement display, 6-peer warning.
- **Scenarios closed:** S4.1-S4.8
- **Tests:** Playwright two-context with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`. Costly — run targeted, not in every iteration.
- **Acceptance:** all S4.x green; S4.3 (two-context P2P) green at least once.

### B5 — Recording (client-mix + local upload)
- **Req#:** R6.1, R6.2, R6.3, R6.4
- **Likely files:** `frontend/src/app/pages/room/recording-mixer.ts`, `backend/src/modules/recording/*`, `backend/migrations/0003_recordings.sql` (if we track filenames in DB) OR filesystem-only
- **Scope:** AudioContext mix; MediaRecorder + Stop logic; `/upload` route; recordings list section on dashboard.
- **Scenarios closed:** S5.1, S5.2, S5.3
- **Tests:** Playwright with fake media + ffprobe assertion on resulting `.webm`.
- **Acceptance:** all S5.x green; uploaded file plays back (visual smoke).

### B6 — coturn + cutover
- **Req#:** R7.1, R7.2, R7.3, R8.3, R8.4, R10.1, R10.3
- **Likely files:** `infra/coturn/turnserver.conf`, `ecosystem.config.js` (or systemd unit), `~/.cloudflared/config.yml` (route update — JROM must approve before edit), `frontend/src/environments/*` for ICE_SERVERS env config, `legacy-poc/` deletion (or move to git tag)
- **Scope:** install + configure coturn locally; wire ICE_SERVERS; PM2 swap; CF Tunnel route update; legacy retirement; rollback dry-run.
- **Scenarios closed:** S6.1-S6.6
- **Tests:** shell + curl + Playwright headed visit to `voice.silverjrom.app`.
- **Acceptance:** all S6.x green; final end-to-end smoke (S6.4) recorded as evidence.

## Test authority

- **B1, B2:** vitest backend tests OK to run unattended.
- **B3, B4, B5:** Playwright targeted module-runs OK to run unattended. Two-context WebRTC tests (B4 S4.3, S4.4) run once per validation cycle, not every iteration.
- **B6:** full e2e sanity check + manual smoke against `voice.silverjrom.app`.

## Dispatch model

Per /projcore §1.8 + §2.9 cross-runtime: each batch brief written to `prompts/batch-<n>.md`, then sent into tmux session `lkvcdx-39` via the 3-call protocol with persona-switch framing (codex must invoke `$lead`, not adopt projcore). Callback target: `projcore-run-2026-05-19/callbacks.md` (codex appends `[projcore callback] batch-<n> <STATE> <note>`).

## Stop conditions

Per /projcore §1.18:
- Contradictory spec → pause + ask JROM
- 3× FAIL on same batch → escalate with 3 options
- Deployment scope exceeds LOCAL+DEV → pause
- coturn install requires elevated privileges JROM didn't pre-authorize → confirm-prompt protocol fires
