# B3 Test Report

> Append-only. B3a covers R4 (user toggle). B3b will append below.

---

## B3a (R4) — User-level diagnostics on/off toggle

## Tested Against URL

- Local: `http://localhost:4700` (PM2 meet-poc-be + meet-poc-fe, both online)
- Render-smoke: Playwright headless Chromium via `E2E_BASE_URL=http://localhost:4700`

## Branch

`feat/meet-diagnostics-audio-20260529` @ HEAD `477d9a4`

---

## Unit Tests (S-1 through S-8)

Run command: `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts`
Artifact: `screenshots/unit-diagnostics-prefs-b3a.txt`

| Test | Scenario | Description | Result | Evidence |
|------|----------|-------------|--------|----------|
| U-1 | S-1 | absent key → readDiagnosticsLoggingEnabled() returns true | PASS | stdout: "diagnostics-prefs: all assertions passed" / exit 0 |
| U-2 | S-2 | key '0' → returns false | PASS | stdout: all assertions passed |
| U-3 | S-3 | key '1' → returns true | PASS | stdout: all assertions passed |
| U-4 | S-4 | non-'0' value → returns true | PASS | stdout: all assertions passed |
| U-5 | S-5 | localStorage throws → returns true, no throw propagated | PASS | stdout: all assertions passed |
| U-6 | S-6 | writeDiagnosticsLoggingEnabled(false) → stores '0', next read returns false | PASS | stdout: all assertions passed |
| U-7 | S-7 | writeDiagnosticsLoggingEnabled(true) → clears '0', next read returns true | PASS | stdout: all assertions passed |
| U-8 | S-8 | round-trip false→true→false stable | PASS | stdout: all assertions passed |

Full stdout: `diagnostics-prefs: all assertions passed` (exit 0)

---

## Build Gate (NS5 — both builds must be green)

Artifacts: `screenshots/builds-b3a.txt`

| Build | Result | Notes |
|-------|--------|-------|
| `cd frontend && npm run build` | PASS (exit 0) | Output location: `frontend/dist/meet-poc-frontend`. 3 pre-existing warnings (DatePipe unused in RoomsPage, stencil empty-glob, mediapipe CommonJS) — none related to B3a changes. |
| `cd backend && npm run build` | PASS (exit 0) | `tsc -p tsconfig.json` clean. |

---

## Structural Assertions (S-9 through S-15)

Artifact: `screenshots/structural-b3a.txt`

| Test | Scenario | Assertion | Result | Evidence |
|------|----------|-----------|--------|----------|
| STRUCT-1 | S-9 / key-literal | `'meet-poc.diagnosticsLogging'` literal appears only in `diagnostics-prefs.ts` (definition) + spec (sanity-check assert) — no other real definition | PASS | grep returns 2 matches: `diagnostics-prefs.ts:15` + `diagnostics-prefs.spec.ts:39` only |
| STRUCT-2 | S-14 (no-dup) | `room.page.ts` has no `function readDiagnosticsLoggingEnabled` or `DIAGNOSTICS_LOGGING_STORAGE_KEY` — duplicate removed | PASS | grep returns 0 matches |
| STRUCT-3 | S-14 (import) | `room.page.ts` imports `readDiagnosticsLoggingEnabled` from `../../services/diagnostics-prefs` | PASS | line 32: `import { readDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';` |
| STRUCT-4 | S-14 (signal) | `room.page.ts` seeds signal from shared reader: `diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled())` | PASS | line 225 |
| STRUCT-5 | S-15 (gates) | All 3 gate sites (start ~2555, queue ~2732, flush ~2749) use `this.diagnosticsLoggingEnabled()` signal — no inline localStorage | PASS | 4 occurrences total (3 gates + 1 payload builder). Lines 2555, 2732, 2749 confirmed as the 3 required gates. |
| STRUCT-6 | S-9 (label) | Settings toggle HTML: `<label class="toggle-row">` contains `Diagnostics logging` text | PASS | `account-settings.component.html:145,152` |
| STRUCT-7 | S-10 / S-11 (reader-seeded init) | Settings component seeds `diagnosticsLogging` from `readDiagnosticsLoggingEnabled()` — NOT hardcoded true | PASS | `account-settings.component.ts:52`: `readonly diagnosticsLogging = signal(readDiagnosticsLoggingEnabled());` |
| STRUCT-8 | S-12 / S-13 (writer in change handler) | Settings `(ngModelChange)="setDiagnosticsLogging($event)"` calls `writeDiagnosticsLoggingEnabled(enabled)` | PASS | `account-settings.component.ts:150,151-153`: change handler sets signal + calls writer |
| STRUCT-9 | S-12 / S-13 (imports) | Settings component imports both reader + writer from `../../services/diagnostics-prefs` | PASS | `account-settings.component.ts:8` |

---

## Render-Smoke (S-9 / S-10 / S-11)

Playwright headless Chromium. Login: `jrom@silverjrom.app` via `INITIAL_PASSWORD.txt`. Navigate `/app/settings`.

| Test | Scenario | Description | Result | Evidence |
|------|----------|-------------|--------|----------|
| RS-1 | S-9 | Diagnostics logging toggle renders visibly in Settings | PASS | `screenshots/settings-toggle-b3a.png` |
| RS-2 | S-10 | Toggle is checked (ON) when localStorage has no prior value | PASS | Playwright: `checkbox.isChecked()` → `true`; console output: "diagnosticsLogging checkbox checked: true" |

Screenshot: `screenshots/settings-toggle-b3a.png` (63 kB captured by Playwright at `/app/settings`)

---

## S-16 — Live POST start/stop (MANUAL-PENDING)

> NS5 reality: a real two-party WebRTC call cannot be driven headless. Not a test failure.

**Status:** MANUAL-PENDING

**Steps (verbatim from scenarios.md):**
1. Open `http://localhost:4700`, log in, join a room (two tabs or two browsers to get to in-call state).
2. Open DevTools Network panel, filter by `/api/meeting-sessions`.
3. Observe periodic POST requests to `/api/meeting-sessions/:id/diagnostics` (confirms baseline ON behavior).
4. Navigate to Settings (`/app/settings`), locate the diagnostics toggle (expected label: "Diagnostics logging"), toggle it OFF.
5. Return to the call. Wait at least 15 seconds (two `DIAGNOSTICS_LOG_INTERVAL_MS` = 7.5s cycles).
6. Verify: NO new POST requests to `/api/meeting-sessions/:id/diagnostics` appear in the Network panel after the toggle was set OFF.
7. Toggle the control back ON (Settings, or a new tab navigated to Settings).
8. Return to the call. Wait at least 15 seconds.
9. Verify: POST requests to `/api/meeting-sessions/:id/diagnostics` resume.

---

## Summary

| Category | Total | PASS | FAIL | MANUAL-PENDING |
|----------|-------|------|------|----------------|
| Unit (S-1..S-8) | 8 | 8 | 0 | 0 |
| Builds | 2 | 2 | 0 | 0 |
| Structural (S-9..S-15) | 9 | 9 | 0 | 0 |
| Render-smoke (S-9/S-10) | 2 | 2 | 0 | 0 |
| Manual (S-16) | 1 | 0 | 0 | 1 (MANUAL-PENDING) |
| **Total** | **22** | **21** | **0** | **1** |

---

## Verdict

**PASS**

All deterministic proofs pass:
- Unit spec: 8/8 assertions passed, exit 0.
- Both builds: frontend + backend clean (exit 0), no new errors.
- Structural: single-source-of-truth confirmed (key literal in `diagnostics-prefs.ts` only), duplicate reader removed from `room.page.ts`, shared import + signal seeding confirmed, all 3 gate sites verified, Settings toggle label/reader-seeded init/writer-wired change handler all confirmed.
- Render-smoke: Settings page renders diagnostics toggle, default checked state confirmed via Playwright (headless Chromium, `http://localhost:4700`).
- S-16 (live POST gate) is MANUAL-PENDING per NS5; does not block the batch verdict.

---

STATUS: DONE (PASS)

---

## B3b (R5) — Global/admin diagnostics kill-switch

## Tested Against URL

- Local: `http://localhost:4700` (PM2 meet-poc-be + meet-poc-fe, both online)
- Admin render-smoke: Playwright headless Chromium via `http://localhost:4700`

## Branch

`feat/meet-diagnostics-audio-20260529` @ HEAD `2c36c86` (B3b = `5b45c88` backend + `2c36c86` frontend, on top of B3a `477d9a4`)

---

## A — Backend vitest (A-1 through A-8, deterministic)

Run command: `cd backend && npx vitest run tests/admin-diagnostics-killswitch.test.ts`
Artifact: `screenshots/backend-killswitch-b3b.txt`

| Test | Scenario | Description | Result | Evidence |
|------|----------|-------------|--------|----------|
| BE-1 | A-1 | Migration idempotency: `app_settings` table created; second `runMigrations` does not throw; schema columns + migration row confirmed | PASS | 10/10 tests passing, exit 0 |
| BE-2 | A-2 | Default ON: absent row → `getDiagnosticsGloballyEnabled` returns `true`; read does not insert a row | PASS | vitest: all 10 tests passing |
| BE-3 | A-3 | Admin PUT false → 200 `{enabled:false}`, row `value='0'`, `updated_at>0`; PUT true → 200 `{enabled:true}`, row `value='1'`; upsert: exactly one row total | PASS | stdout: `[admin] diagnostics globally DISABLED` + `ENABLED` |
| BE-4 | A-4 | requireAdmin enforced: GET/PUT no-cookie → 401; non-admin cookie → 403; admin cookie → 200 | PASS | vitest: all 10 tests passing |
| BE-5 | A-5 | Global ON: admitted poster POST → 200 `{ok:true, entry:{...}}`, row IS inserted | PASS | WS admit log + vitest pass |
| BE-6 | A-6 | Global OFF: admitted poster POST → 200 `{ok:true,persisted:false}`, row count unchanged | PASS | vitest: all 10 tests passing |
| BE-7 | A-7 | Admit-check precedes global gate: non-admitted poster → 403 even when global OFF | PASS | vitest: all 10 tests passing |
| BE-8 | A-8 | `/api/me` carries `diagnosticsGloballyEnabled` on all four paths (guest ON/OFF, signed-in ON/OFF) + fail-open throws→true | PASS | 5 sub-assertions in A-8a..A-8e all pass |

**Summary: 10/10 vitest tests pass, exit 0.**

---

## B — Frontend truth-table unit + B3a regression (B-1 + regression)

Run commands:
- `cd frontend && npx tsx src/app/services/diagnostics-global-flag.spec.ts`
- `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts` (B3a regression)

Artifact: `screenshots/unit-global-flag-b3b.txt`

| Test | Scenario | Description | Result | Evidence |
|------|----------|-------------|--------|----------|
| FE-1 | B-1 (ON,ON)→true | `computeEffectiveDiagnosticsEnabled(true, true)` → `true` | PASS | stdout: "diagnostics-global-flag: all assertions passed" / exit 0 |
| FE-2 | B-1 (ON,OFF)→false | `computeEffectiveDiagnosticsEnabled(true, false)` → `false` | PASS | stdout: all assertions passed |
| FE-3 | B-1 (OFF,ON)→false | `computeEffectiveDiagnosticsEnabled(false, true)` → `false` | PASS | stdout: all assertions passed |
| FE-4 | B-1 (OFF,OFF)→false | `computeEffectiveDiagnosticsEnabled(false, false)` → `false` | PASS | stdout: all assertions passed |
| FE-5 | B3a regression | `diagnostics-prefs.spec.ts` — S-1..S-8 all pass (B3a unchanged) | PASS | stdout: "diagnostics-prefs: all assertions passed" / exit 0 |

---

## Build Gate (NS5 — both builds must be green)

Artifact: `screenshots/builds-b3b.txt`

| Build | Result | Notes |
|-------|--------|-------|
| `cd backend && npm run build` | PASS (exit 0) | `tsc -p tsconfig.json` clean, no errors |
| `cd frontend && npm run build` | PASS (exit 0) | 3 pre-existing warnings (DatePipe/stencil empty-glob/mediapipe CommonJS) — none related to B3b changes. Output: `frontend/dist/meet-poc-frontend` |

---

## Structural Assertions (B-2, B-3, B-4, NS8, C-2, Migration)

Artifact: `screenshots/structural-b3b.txt`

| Test | Scenario | Assertion | Result | Evidence |
|------|----------|-----------|--------|----------|
| STRUCT-1 | B-2 signal default | `auth.service.ts:32` — `readonly diagnosticsGloballyEnabled = signal(true)` | PASS | grep line 32 |
| STRUCT-2 | B-2 MeResponse type | `auth.service.ts:13` — `diagnosticsGloballyEnabled?: boolean` in `MeResponse` type | PASS | grep line 13 |
| STRUCT-3 | B-2 fail-open set | `auth.service.ts:44` — `this.diagnosticsGloballyEnabled.set(res.diagnosticsGloballyEnabled ?? true)` | PASS | grep line 44 |
| STRUCT-4 | B-3 AND gate count | `effectiveDiagnosticsEnabled()` count in `room.page.ts` = 3 (lines 2560, 2737, 2754) | PASS | grep -c returns 3 |
| STRUCT-5 | B-3 bare gates gone | `!this.diagnosticsLoggingEnabled()` in `room.page.ts` = 0 matches | PASS | grep returns no matches |
| STRUCT-6 | B-4b AdminService methods | `admin.service.ts` has `getDiagnosticsEnabled` (GET, line 35) + `setDiagnosticsEnabled` (PUT, line 40) calling `/api/admin/settings/diagnostics` | PASS | grep lines 35–42 |
| STRUCT-7 | B-4d no inline URL | `admin/settings/diagnostics` in `admin.page.ts` = 0 matches (URL only in service) | PASS | grep returns no matches |
| STRUCT-8 | B-4c toggle in admin UI | `admin.page.html:40` — `<h3>Diagnostics logging</h3>` + `<input type="checkbox">` with `[ngModel]="diagnosticsEnabled()"` + no general settings editor pattern | PASS | grep lines 39–54 |
| STRUCT-9 | B-4a adminGuard reuse | `app.routes.ts:27` — `canActivate: [adminGuard]` on admin route (pre-existing guard reused, no new auth) | PASS | grep shows definition + route usage |
| STRUCT-10 | NS8 requireAdmin reuse | `admin/index.ts:4,23` imports and uses `requireAdmin` from existing middleware; comment on line 72–73 confirms no new RBAC boundary | PASS | grep lines 4, 23, 72–73 |
| STRUCT-11 | NS8 middleware untouched | `git diff 477d9a4..HEAD -- backend/src/modules/auth/middleware.ts` is empty | PASS | empty diff |
| STRUCT-12 | C-2 no live push | `grep -rn diagnosticsGloballyEnabled\|killswitch\|kill-switch backend/src/modules/signaling/` = 0 matches | PASS | grep returns no matches |
| STRUCT-13 | Migration idempotent | `0012_app_settings.sql` uses `CREATE TABLE IF NOT EXISTS`; file contains no `INSERT` seed row | PASS | SQL: 4-line CREATE TABLE only |

---

## Admin UI Render-Smoke (B-4c)

Playwright headless Chromium. Login: `jrom@silverjrom.app`. Navigate `/app/admin`.

| Test | Scenario | Description | Result | Evidence |
|------|----------|-------------|--------|----------|
| RS-B3b-1 | B-4c | Admin page renders "Diagnostics logging" section with toggle | PASS | `screenshots/admin-diagnostics-toggle-b3b.png` |
| RS-B3b-2 | B-4c | Toggle is checked ON (default state) | PASS | Playwright: Toggle 1 checked=true, label "Diagnostics logging ON" |

Screenshot: `screenshots/admin-diagnostics-toggle-b3b.png` (Playwright Chromium, `/app/admin`)

---

## C-1 — Admin End-to-End Live Call (MANUAL-PENDING)

> NS5 reality: a real two-party WebRTC call cannot be driven headless. Not a test failure.

**Status:** MANUAL-PENDING

**Steps (verbatim from scenarios.md C-1):**
1. Open `http://localhost:4700`, log in as `jrom@silverjrom.app` (admin).
2. Navigate to the Admin page (route containing `adminGuard`).
3. Locate the "Diagnostics logging" toggle. Confirm it is checked ON (default).
4. Open a second tab, join a room (two-tab call to reach in-call state). Open DevTools Network panel, filter by `/api/meeting-sessions`. Observe periodic POST requests to `/api/meeting-sessions/:id/diagnostics` confirming baseline ON.
5. Return to the Admin tab. Toggle the diagnostics switch OFF. Confirm the toggle shows OFF state and no error banner appears.
6. Call `GET /api/admin/settings/diagnostics` directly (DevTools or curl with session cookie). Confirm response is `{enabled: false}`.
7. In the second tab (in-call), POST a new diagnostics payload manually (or wait for the periodic flush). Verify the response is `{ok: true, persisted: false}` (not `{ok: true, entry: {...}}`). Verify no new row in `meeting_session_diagnostics`.
8. Close the room and re-enter from the same tab (triggering a new `checkSession` → `/api/me` on room page load). Confirm: `GET /api/me` response now includes `diagnosticsGloballyEnabled: false`. Confirm: no new diagnostics POSTs are initiated after room entry.
9. Return to the Admin tab. Toggle diagnostics back ON.
10. Re-enter the room again. Confirm diagnostics POSTs resume.

---

## C-2 — Mid-Session Flip (Documented Behavior — STRUCTURAL PASS)

> No live push mechanism built; this is intentional. Structural proof in STRUCT-12.

- Backend gate takes effect immediately on the next POST (returns `{ok:true,persisted:false}` with no row) — vitest A-6 proves this.
- No WebSocket push, SSE, or poll mechanism for the flag — STRUCT-12 confirms 0 matches in `signaling/`.
- Client learns on next room entry via `/api/me` — A-8 proves the field is present.

**Status:** PASS (structural) — intentional mid-session window documented per scenarios.md C-2.

---

## Summary

| Category | Total | PASS | FAIL | MANUAL-PENDING |
|----------|-------|------|------|----------------|
| Backend vitest A-1..A-8 (10 tests) | 10 | 10 | 0 | 0 |
| Frontend truth-table B-1 (4 cases) + B3a regression | 5 | 5 | 0 | 0 |
| Builds (BE + FE) | 2 | 2 | 0 | 0 |
| Structural (B-2..B-4, NS8, C-2, migration) | 13 | 13 | 0 | 0 |
| Admin render-smoke (B-4c) | 2 | 2 | 0 | 0 |
| C-1 live two-party call | 1 | 0 | 0 | 1 (MANUAL-PENDING) |
| **Total** | **33** | **32** | **0** | **1** |

---

## Verdict

**PASS**

All deterministic proofs pass:
- Backend vitest: 10/10 tests pass (A-1..A-8 covering migration, default-ON, PUT round-trip, requireAdmin enforcement, POST gate ON/OFF, admit-check ordering, /api/me on all paths + fail-open), exit 0.
- Frontend truth-table: all 4 AND-gate combinations correct (`computeEffectiveDiagnosticsEnabled`), exit 0.
- B3a regression: `diagnostics-prefs.spec.ts` still passes (S-1..S-8 unchanged), exit 0.
- Both builds: frontend + backend clean (exit 0), no new errors.
- Structural (13/13): AuthService signal defaults true + MeResponse type + fail-open `?? true` set; effectiveDiagnosticsEnabled used at all 3 gate sites; bare single-signal guards removed; AdminService GET/PUT methods + URL isolated in service; admin.page.ts has no inline URL; admin.page.html has diagnostics toggle (no general settings editor); adminGuard reused; requireAdmin is the sole auth check; middleware.ts untouched; no live push in signaling/; migration is `CREATE TABLE IF NOT EXISTS` with no INSERT seed.
- Admin render-smoke: "Diagnostics logging" toggle renders at `/app/admin`, default checked=true.
- C-1 (live two-party call flip) is MANUAL-PENDING per NS5; does not block the batch verdict.

---

STATUS: DONE (PASS)
