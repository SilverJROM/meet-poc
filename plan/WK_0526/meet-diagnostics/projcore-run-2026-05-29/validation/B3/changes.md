# B3 — Diagnostics User Preferences — changes.md

> Append-only per batch. B3a (R4) below. B3b will append its own section beneath this — do NOT clobber.

---

## B3a (R4)

### Branch

`feat/meet-diagnostics-audio-20260529` (continued; B3a committed on top of `2c062ff`). No new branch.

### User Report (verbatim)

> "R4 — User-level diagnostics on/off toggle. A visible toggle in Settings (default ON). When OFF, that client stops collecting AND uploading diagnostics. Persisted."

JROM (verbatim):

> "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

### Root Cause (feature — what + where)

This is a feature, not a bug. The localStorage flag `meet-poc.diagnosticsLogging` already gated diagnostics collect + upload at three sites in `room.page.ts` (`startDiagnosticsLogger`, `queueDiagnosticsLog`, `flushDiagnosticsLog`), each early-returning when the `diagnosticsLoggingEnabled` signal is false. But the flag had **no setter and no UI** — there was no way for a user to flip it. The key constant and reader also lived privately inside `room.page.ts`, so a Settings control could not share the contract without duplicating the key literal.

What this batch lands:
1. A **shared prefs module** (`frontend/src/app/services/diagnostics-prefs.ts`) that owns the key literal (single source of truth), the reader (contract preserved verbatim), and a new writer.
2. `room.page.ts` rewired to **consume** the shared reader (its private duplicate const + function deleted — no dead code, deferral OFF).
3. A **labeled toggle in Settings → Account** (default ON, seeded from the reader, persists immediately via the writer on change).
4. A **unit spec** exercising the real exported reader/writer (S-1..S-8 + writer error-safety) via `npx tsx`.

### Code Changes (per file — WHAT + WHY)

**NEW `frontend/src/app/services/diagnostics-prefs.ts`**
- `export const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging'` — single source of truth for the flag key. After this batch the literal exists ONLY here (and a sanity assertion in the spec).
- `export function readDiagnosticsLoggingEnabled(): boolean` — preserves the exact original contract: `window.localStorage.getItem(KEY) !== '0'` in a try/catch that returns `true` on throw. Absent ⇒ `true`; `'0'` ⇒ `false`; any other value ⇒ `true`; localStorage throws ⇒ `true`.
- `export function writeDiagnosticsLoggingEnabled(enabled: boolean): void` — `setItem(KEY, enabled ? '1' : '0')` guarded by try/catch (swallowed, no throw to callers). Round-trips through the reader: `false` ⇒ stores `'0'` (reader false); `true` ⇒ stores `'1'` (reader true). WHY: lets the Settings control persist to the SAME flag the in-call gates read.

**`frontend/src/app/pages/room/room.page.ts`**
- Added `import { readDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';`.
- DELETED the private `const DIAGNOSTICS_LOGGING_STORAGE_KEY = 'meet-poc.diagnosticsLogging'` (was line 46).
- DELETED the private `function readDiagnosticsLoggingEnabled()` (was lines 3011–3017). WHY: no dead duplicate — single source of truth now lives in the shared module (deferral OFF, pre-live).
- KEPT `readonly diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled())` (now seeded from the shared import). The three gate sites (`startDiagnosticsLogger`, `queueDiagnosticsLog`, `flushDiagnosticsLog`) read the signal unchanged. The interface field `diagnosticsLoggingEnabled?: boolean` (~line 3184, a debug-snapshot property — NOT the key literal) is untouched.

**`frontend/src/app/components/account-settings/account-settings.component.ts`** (the Account tab body, `<app-account-settings />`)
- Added `import { readDiagnosticsLoggingEnabled, writeDiagnosticsLoggingEnabled } from '../../services/diagnostics-prefs';`.
- Added `readonly diagnosticsLogging = signal(readDiagnosticsLoggingEnabled())` — initial state seeded from the reader (NOT hardcoded `true`), so the absent-key⇒true contract gives default ON and a persisted `'0'` renders unchecked on load.
- Added `setDiagnosticsLogging(enabled: boolean)` — sets the local signal AND calls `writeDiagnosticsLoggingEnabled(enabled)` so the change persists immediately to the same flag. No network call.

**`frontend/src/app/components/account-settings/account-settings.component.html`**
- Added a "Diagnostics" `account-field` block at the end (after Telegram, behind a divider) with a hint and a `label.toggle-row` containing `<input type="checkbox" name="diagnosticsLogging" [ngModel]="diagnosticsLogging()" (ngModelChange)="setDiagnosticsLogging($event)">` labeled "Diagnostics logging". Reuses the existing `toggle-row` markup pattern; no new top-level Settings tab.

**`frontend/src/app/components/account-settings/account-settings.component.scss`**
- Added a scoped `.toggle-row` rule (flex, gap, accent-color) — the component is view-encapsulated, so it does not inherit the `toggle-row` style defined in other pages; this keeps the checkbox + label rendered cleanly inline.

### Commits

- `[batch-3a] diagnostics user toggle: shared diagnostics-prefs (read+write) wired to Settings toggle + room.page reader | scenarios: S-1..S-16`

### Standing Rules

- The flag key literal `'meet-poc.diagnosticsLogging'` lives ONLY in `diagnostics-prefs.ts` going forward. Any future reader/writer/consumer imports from that module — do not re-introduce inline `localStorage.getItem('meet-poc.diagnosticsLogging')` elsewhere.

### Verification

Lifecycle = **pre-live** (default, project_specs has no post-live flag) ⇒ deferral OFF: dead duplicate const + function removed in the same batch; no TODO/FIXME, no orphan code.

Commands (all from repo root unless noted):

| Check | Command | Result |
|---|---|---|
| New unit spec (S-1..S-8 + writer error-safety) | `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts` | **PASS** — `diagnostics-prefs: all assertions passed`, exit 0 |
| Reference spec sanity (untouched) | `cd frontend && npx tsx src/app/services/mic-energy.spec.ts` | **PASS** — exit 0 |
| Frontend build (NS5) | `cd frontend && npm run build` | **PASS** — exit 0 (only pre-existing unrelated warnings: DatePipe in RoomsPage, stencil glob, mediapipe CommonJS) |
| Backend build (untouched, no breakage) | `cd backend && npm run build` | **PASS** — exit 0 |

Structural grep evidence:

```
# room.page.ts — duplicate removed, key literal centralized, shared import present (S-14)
grep -c "function readDiagnosticsLoggingEnabled" room.page.ts   => 0
grep -c "'meet-poc.diagnosticsLogging'"          room.page.ts   => 0
grep -c "DIAGNOSTICS_LOGGING_STORAGE_KEY"        room.page.ts   => 0
grep -n  "diagnostics-prefs"                     room.page.ts   => import present (line 32)
grep -c  "diagnosticsLoggingEnabled()"           room.page.ts   => 4 (3 gates + debug-snapshot field; all via the signal) (S-15)

# Settings — label, reader-seeded init, writer-on-change (S-9..S-13)
account-settings.component.html : label "Diagnostics logging" + checkbox bound to diagnosticsLogging()
account-settings.component.ts   : diagnosticsLogging = signal(readDiagnosticsLoggingEnabled())  (not hardcoded true)
account-settings.component.ts   : setDiagnosticsLogging() -> writeDiagnosticsLoggingEnabled($event)

# Single source of truth — key literal only in the shared module (+ a spec sanity assertion)
grep -rn "'meet-poc.diagnosticsLogging'" src/app/
  => services/diagnostics-prefs.ts (the export)
  => services/diagnostics-prefs.spec.ts (assert KEY === literal — sanity only, not a second definition)
```

Smoke walk (structural / unit; live network gate is the S-16 manual NS5 note, headless cannot drive a real WebRTC call):
- Fresh state (no key) ⇒ reader returns true ⇒ Settings toggle renders checked (default ON), in-call signal true ⇒ diagnostics flow.
- Toggle OFF in Settings ⇒ `setDiagnosticsLogging(false)` ⇒ writer stores `'0'` ⇒ next `readDiagnosticsLoggingEnabled()` is false. A room page seeding its signal from the reader (on mount) then short-circuits all three gates ⇒ no collect, no upload POSTs.
- Toggle back ON ⇒ writer stores `'1'` ⇒ reader true ⇒ gates resume.

### Caveats

- **S-16 (live call network gate) — manual NS5 only.** Headless cannot fully drive a live two-party WebRTC call to observe `/api/meeting-sessions/:id/diagnostics` POSTs start/stop. The three gate sites short-circuit on the signal (proven by S-15 grep + the round-trip unit proof). Manual localhost steps are recorded in scenarios.md S-16; to be executed at independent validation. PRE-EXISTING constraint, not a regression.
- **Cross-tab/navigation freshness:** the Settings signal and the room signal are each seeded from localStorage at construction. A change made in Settings is picked up by the room page when the room (re)mounts and re-seeds its signal from the reader (Settings and the call are separate routes). If a future flow keeps the in-call page mounted while editing Settings in the same tab, a live re-read would be needed — out of scope for B3a (R4 says "Persisted", which localStorage satisfies). Noted as adjacent, not a defect of this batch.
- **Persistence is per-device (localStorage), by design** — backend persistence / `/api/me` field / admin surface / migrations are explicitly B3b and out of scope here.
- Pre-existing frontend build warnings (DatePipe unused in RoomsPage, stencil empty-glob, mediapipe non-ESM) are unrelated to this change.

---

## B3b (R5)

### Branch

`feat/meet-diagnostics-audio-20260529` (continued; B3b committed on top of `477d9a4` / B3a). No new branch, no merge.

### User Report (verbatim)

> "R5 — Global/admin diagnostics kill-switch. A master switch (admin/global) so diagnostics can be turned off globally. When OFF: backend stops accepting/persisting diagnostics AND clients learn to stop collecting (via the existing config/me surface). Reuses existing admin auth — NO new auth/RBAC boundary."

NS8 (verbatim): reuse the EXISTING admin module + auth — feature toggle, NOT a new RBAC boundary.

JROM (verbatim):

> "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

### Root Cause (feature — what + where)

This is a feature, not a bug. B3a gave each client a per-device user toggle (localStorage) but there was no *global* off-switch. The owner/admin had no way to stop diagnostics fleet-wide, and the backend always persisted any admitted poster's payload. B3b adds a DB-backed master switch (admin-flippable at runtime, no redeploy) that (a) makes the backend POST a no-op when OFF and (b) is surfaced on `/api/me` so clients stop collecting. It ANDs with the B3a user toggle on the client: diagnostics flow only when BOTH are ON.

DB-vs-env decision recorded in `decisions/2026-05-30-b3b-db-vs-env-killswitch.md` (chose DB `app_settings` over an env var because the switch must flip AT RUNTIME with no `pm2 restart`; reuses the existing better-sqlite3 + migration runner; absent-row ⇒ ON default; fail-open).

### Code Changes (per file — WHAT + WHY)

**NEW `backend/migrations/0012_app_settings.sql`**
- Idempotent generic KV table: `app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`. Matches the `0011_user_backgrounds.sql` format (`CREATE TABLE IF NOT EXISTS`). No seed row — absent ⇒ global ON (A-1, A-2).

**NEW `backend/src/modules/app-settings/store.ts`** — single source of truth for the flag.
- `DIAGNOSTICS_GLOBALLY_ENABLED_KEY = 'diagnostics_globally_enabled'`.
- `getDiagnosticsGloballyEnabled(db): boolean` — reads `app_settings`; absent ⇒ `true`; value `'0'` ⇒ `false`; else ⇒ `true`. FAIL-OPEN: try/catch returns `true` on ANY error (A-2, A-8e).
- `setDiagnosticsGloballyEnabled(enabled, db): void` — UPSERT (`INSERT ... ON CONFLICT(key) DO UPDATE`) storing `'1'`/`'0'` + `updated_at = Date.now()`; keeps exactly one row (A-3).

**`backend/src/modules/admin/index.ts`** — admin routes scoped to the diagnostics flag ONLY (no general settings editor).
- Added `GET /admin/settings/diagnostics` (`admin` = existing `requireAdmin`) ⇒ `200 { enabled }`.
- Added `PUT /admin/settings/diagnostics` (`admin`) ⇒ coerces `body.enabled` to boolean, calls the store setter ⇒ `200 { enabled }`. WHY: reuses the SAME `requireAdmin` already on `/admin/users` — NO new middleware, NO new RBAC boundary (NS8) (A-4).

**`backend/src/modules/sessions/index.ts`** — diagnostics POST gate.
- After the `isAdmittedDiagnosticPoster` 403 and BEFORE `appendDiagnosticsEntry`: `if (!getDiagnosticsGloballyEnabled(database)) return res.json({ ok: true, persisted: false });`. WHY: admit-check still precedes the global gate (A-7); global OFF ⇒ no row, authoritative immediate kill (A-6); global ON ⇒ unchanged `{ ok, entry }` + insert (A-5).

**`backend/src/modules/auth/index.ts`** — `/api/me` carries the flag so clients learn it.
- Guest path: `{ user: null, diagnosticsGloballyEnabled: getDiagnosticsGloballyEnabled(database) }`.
- Signed-in path: added top-level `diagnosticsGloballyEnabled` (NOT nested under `user`). Store helper is itself fail-open ⇒ A-8e holds (A-8a..A-8e).

**`frontend/src/app/services/diagnostics-prefs.ts`** — added the pure AND helper (B3a exports untouched).
- `export function computeEffectiveDiagnosticsEnabled(userEnabled, globalEnabled): boolean { return userEnabled && globalEnabled; }` (B-1).

**`frontend/src/app/services/auth.service.ts`**
- `MeResponse` gains `diagnosticsGloballyEnabled?: boolean`.
- New public signal `readonly diagnosticsGloballyEnabled = signal(true)` (default true, fail-open).
- In `checkSession` success `.then`: `this.diagnosticsGloballyEnabled.set(res.diagnosticsGloballyEnabled ?? true)` — set BEFORE the user-present/user-null branch so BOTH guests and signed-in users learn the flag. The `.catch` path leaves the signal at its default `true` (fail-open) (B-2).

**`frontend/src/app/pages/room/room.page.ts`**
- Import widened to `{ computeEffectiveDiagnosticsEnabled, readDiagnosticsLoggingEnabled }`.
- Added `readonly effectiveDiagnosticsEnabled = computed(() => computeEffectiveDiagnosticsEnabled(this.diagnosticsLoggingEnabled(), this.auth.diagnosticsGloballyEnabled()))` (`computed` and `auth` already present).
- Replaced the THREE gate guards (`startDiagnosticsLogger`, `queueDiagnosticsLog`, `flushDiagnosticsLog`) from `!this.diagnosticsLoggingEnabled()` to `!this.effectiveDiagnosticsEnabled()`. The payload-builder line that records the USER pref (`diagnosticsLoggingEnabled: this.diagnosticsLoggingEnabled()`) is left as-is per brief (B-3).

**`frontend/src/app/services/admin.service.ts`** — the endpoint URL literal lives ONLY here.
- `getDiagnosticsEnabled(): Promise<boolean>` (GET) + `setDiagnosticsEnabled(enabled): Promise<boolean>` (PUT) against `/api/admin/settings/diagnostics` (B-4b).

**`frontend/src/app/pages/admin/admin.page.ts` + `.html`** — single labeled toggle (not a KV editor).
- Component: `diagnosticsEnabled` + `diagnosticsError` signals, `loadDiagnosticsSetting()` (called in `ngOnInit`), `setDiagnosticsEnabled($event)` change handler — delegates to `AdminService`, no inline `HttpClient` for this toggle.
- Template: a "Diagnostics logging" `toggle-row` checkbox panel bound to `diagnosticsEnabled()` / `setDiagnosticsEnabled($event)`. Reuses the existing admin-page `.toggle-row` SCSS (B-4c, B-4d).
- Admin route already uses `adminGuard` (`app.routes.ts:27`) — reused, no new guard (B-4a).

### Commits

- `[batch-3b] diagnostics global kill-switch: app_settings migration + store + admin get/set (requireAdmin) + POST gate + /api/me field | scenarios: A-1..A-8`
- `[batch-3b] client global precedence: effective AND-gate + AuthService signal + minimal admin toggle | scenarios: B-1..B-4`

### Standing Rules

- The global-flag store key `'diagnostics_globally_enabled'` and its read/write live ONLY in `backend/src/modules/app-settings/store.ts`. Admin routes, the POST gate, and `/api/me` all call the helper — do not read `app_settings` inline elsewhere.
- The admin diagnostics endpoint URL `/api/admin/settings/diagnostics` lives ONLY in `frontend/src/app/services/admin.service.ts`.

### Verification

Lifecycle = **pre-live** (default) ⇒ deferral OFF: no TODO/FIXME, no dead code, no env-var shim. The `/api/me` contract change was propagated into the existing `auth-me-logout.test.ts` in the same batch (no stale assertion left behind).

| Check | Command | Result |
|---|---|---|
| New backend kill-switch test (A-1..A-8) | `cd backend && npx vitest run tests/admin-diagnostics-killswitch.test.ts` | **PASS** — 10 tests, exit 0 |
| /api/me regression (contract updated) | `cd backend && npx vitest run tests/auth-me-logout.test.ts` | **PASS** — 2 tests (was failing pre-fix; assertions updated for the new field) |
| Diagnostics POST path unbroken (A-5 ON path) | `cd backend && npx vitest run tests/session-diagnostics.test.ts` | **PASS** — 3 tests |
| New frontend truth-table unit (B-1) | `cd frontend && npx tsx src/app/services/diagnostics-global-flag.spec.ts` | **PASS** — `diagnostics-global-flag: all assertions passed`, exit 0 |
| B3a prefs unit (regression) | `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts` | **PASS** — exit 0 |
| Backend build | `cd backend && npm run build` | **PASS** — exit 0 |
| Frontend build | `cd frontend && npm run build` | **PASS** — exit 0 (same pre-existing warnings as B3a) |
| Full backend suite | `cd backend && npx vitest run` | 142 passed; remaining failures are PRE-EXISTING (see Caveats), not B3b |

Structural grep evidence:

```
# B-2 — AuthService (3 matches: MeResponse field, signal(true), ?? true)
grep -n diagnosticsGloballyEnabled auth.service.ts  => :13 type, :32 signal(true), :44 ?? true

# B-3 — room.page (3 effective gates, 0 bare guards)
grep -c "effectiveDiagnosticsEnabled()"        room.page.ts => 3
grep -c "!this.diagnosticsLoggingEnabled()"    room.page.ts => 0

# B-4 — admin.service URL only here; admin page delegates (0 inline URL); adminGuard reused
grep -c "admin/settings/diagnostics" admin.service.ts        => 2
grep -c "admin/settings/diagnostics" admin.page.ts           => 0
grep -rc adminGuard frontend/src/app/                        => 3 (definition + import + route)

# C-2 — no live-push: flag never enters signaling/
grep -rc "diagnosticsGlobal|diagnostics_globally|killswitch|kill-switch" backend/src/modules/signaling/ => 0
grep -rl getDiagnosticsGloballyEnabled backend/src/modules/  => app-settings, auth, admin, sessions (NOT signaling)
```

Smoke walk (structural / unit; live two-party call is the C-1 manual NS5 note):
- Default (no `app_settings` row) ⇒ store reads `true` ⇒ `/api/me` reports `true` ⇒ client `effectiveDiagnosticsEnabled = userToggle && true` ⇒ diagnostics flow; POST inserts (A-5).
- Admin PUT `{enabled:false}` ⇒ store row `value='0'` ⇒ POST returns `{ok:true,persisted:false}` with no row (A-6, backend-authoritative) AND next `/api/me` reports `false` ⇒ client effective gate false on next room entry ⇒ no collection.
- Admin PUT `{enabled:true}` ⇒ back to ON.

### Caveats

- **C-1 (admin UI end-to-end) — manual NS5 only.** Headless cannot drive a live two-party WebRTC call to watch `/api/meeting-sessions/:id/diagnostics` POSTs start/stop around the admin toggle. The backend gate + `/api/me` field are deterministically proven by A-5/A-6/A-8; manual localhost steps are in scenarios.md C-1. PRE-EXISTING constraint, not a regression.
- **C-2 (mid-session flip) — INTENDED behavior, not a defect.** A client already in-call keeps POSTing until its next `/api/me` (next room entry). The backend gate is the authoritative kill immediately on the next POST (no row persisted). No WS/SSE/polling push was added (NS8). Proven by the C-2 grep (0 hits in `signaling/`).
- **PRE-EXISTING full-suite failures (NOT introduced by B3b).** At the clean baseline `477d9a4` (B3a HEAD, before any B3b change), the following already fail deterministically because their assertions hard-code an exact response body that predates the earlier `displayName`/`isAdmin` additions to `/api/login` and `/api/me`: `auth-login.test.ts S1.1`, `migrate-from-json.test.ts S1.7`, `rooms.test.ts S2.1 / S2.5 / DR-15`, `sessions-ttl.test.ts S1.6`. These are unrelated to R5 (B3b never touches `/api/login`, rooms, sessions-ttl, or the JSON migration) — fixing them would be scope creep into earlier batches. `auth-me-logout.test.ts` was the ONE existing /api/me test my change broke; it is fixed in this batch (assertions updated for the new field + the pre-existing `displayName`/`isAdmin` drift). `signaling-waiting-room` / `signaling-reconnect` flake intermittently on the 1s WS-message timeout under parallel load (pass in isolation) — pre-existing environment flake, not a B3b code defect.
