# B3 Scenarios — Diagnostics User Preferences

> This file is append-only. B3a covers R4 (user toggle). B3b will append a sibling section for backend/admin concerns.

---

## B3a (R4) — User-level diagnostics on/off toggle

**Requirement (verbatim):** "R4 — User-level diagnostics on/off toggle. A visible toggle in Settings (default ON). When OFF, that client stops collecting AND uploading diagnostics. Persisted."

**JROM (verbatim):** "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

**Scope:** frontend-only. localStorage persistence (per-device). No backend, no migration, no admin surface.

**Unit test runner:** `cd frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts`
(mirrors `mic-energy.spec.ts` / `mic-capture-health.spec.ts` style: `node:assert/strict`, top-level assertion blocks, single `console.log` at end)

---

### Scenario → Proof Mapping

| Criteria | Proof type | Artifact |
|---|---|---|
| 1–2 (prefs read/write contract) | Deterministic frontend unit test — pure function, localStorage shimmed | `diagnostics-prefs.spec.ts` run via `npx tsx` |
| 3–5 (toggle rendering + gates) | Structural assertions — grep/AST checks confirming element present, single key literal, shared import | File-level grep evidence in test-report |
| 6 (live call network gate) | Manual localhost note (NS5) — headless cannot fully drive a real call | Notes in independent-validation.md |

---

### Criteria

**S-1 — Shared prefs reader: absent key → enabled**

Given: `localStorage` does not contain the key `meet-poc.diagnosticsLogging` (key is absent — `getItem` returns `null`).
When: `readDiagnosticsLoggingEnabled()` is called from the shared prefs module.
Then: returns `true`.

Assertion: `assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'absent key -> true')`

---

**S-2 — Shared prefs reader: key '0' → disabled**

Given: `localStorage` contains `meet-poc.diagnosticsLogging` = `'0'`.
When: `readDiagnosticsLoggingEnabled()` is called.
Then: returns `false`.

Assertion: `assert.strictEqual(readDiagnosticsLoggingEnabled(), false, "key '0' -> false")`

---

**S-3 — Shared prefs reader: key '1' → enabled**

Given: `localStorage` contains `meet-poc.diagnosticsLogging` = `'1'`.
When: `readDiagnosticsLoggingEnabled()` is called.
Then: returns `true`.

Assertion: `assert.strictEqual(readDiagnosticsLoggingEnabled(), true, "key '1' -> true")`

---

**S-4 — Shared prefs reader: any non-'0' value → enabled**

Given: `localStorage` contains `meet-poc.diagnosticsLogging` = `'yes'` (arbitrary non-'0' string).
When: `readDiagnosticsLoggingEnabled()` is called.
Then: returns `true` (contract: absent or non-'0' → true; ONLY '0' → false).

Assertion: `assert.strictEqual(readDiagnosticsLoggingEnabled(), true, "non-'0' string -> true")`

---

**S-5 — Shared prefs reader: localStorage throws → defaults true (error safety)**

Given: `localStorage.getItem` throws (e.g. SecurityError / private-browsing restriction).
When: `readDiagnosticsLoggingEnabled()` is called.
Then: returns `true` without propagating the error.

Assertion:
```
const realGetItem = localStorage.getItem;
localStorage.getItem = () => { throw new Error('SecurityError'); };
assert.doesNotThrow(() => readDiagnosticsLoggingEnabled(), 'must not throw when localStorage inaccessible');
assert.strictEqual(readDiagnosticsLoggingEnabled_noThrow(), true, 'throws -> defaults true');
localStorage.getItem = realGetItem;
```
(Spec shimmed with a try/catch wrapper or inline override matching the pattern used in room.page.ts:3011–3016.)

---

**S-6 — Shared prefs write(false): persists '0', next read returns false**

Given: `localStorage` starts in any state.
When: `writeDiagnosticsLoggingEnabled(false)` is called from the shared prefs module.
Then:
- `localStorage.getItem('meet-poc.diagnosticsLogging')` === `'0'`
- next call to `readDiagnosticsLoggingEnabled()` returns `false`

Assertions:
```
writeDiagnosticsLoggingEnabled(false);
assert.strictEqual(localStorage.getItem('meet-poc.diagnosticsLogging'), '0', 'write(false) stores "0"');
assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) -> next read false');
```

---

**S-7 — Shared prefs write(true): persists non-'0', next read returns true**

Given: `localStorage` previously held `'0'` (disabled state).
When: `writeDiagnosticsLoggingEnabled(true)` is called.
Then:
- `localStorage.getItem('meet-poc.diagnosticsLogging')` !== `'0'` (any value that satisfies the reader contract — e.g. `'1'` or key removal)
- next call to `readDiagnosticsLoggingEnabled()` returns `true`

Assertions:
```
writeDiagnosticsLoggingEnabled(false); // set known disabled state
writeDiagnosticsLoggingEnabled(true);
assert.notStrictEqual(localStorage.getItem('meet-poc.diagnosticsLogging'), '0', 'write(true) clears the "0" sentinel');
assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'write(true) -> next read true');
```

---

**S-8 — Write round-trip: false → true → false is stable**

Given: clean `localStorage`.
When: three consecutive writes `false`, `true`, `false`.
Then: each subsequent read returns the last written value.

Assertions:
```
writeDiagnosticsLoggingEnabled(false);
assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) round-trip');
writeDiagnosticsLoggingEnabled(true);
assert.strictEqual(readDiagnosticsLoggingEnabled(), true, 'write(true) round-trip');
writeDiagnosticsLoggingEnabled(false);
assert.strictEqual(readDiagnosticsLoggingEnabled(), false, 'write(false) again round-trip');
```

---

**S-9 — Settings toggle renders with a visible label (structural)**

Given: Settings page is loaded at `/app/settings`.
Then:
- A `<label>` (or equivalent `aria-label` / text node) containing the text `Diagnostics logging` (or equivalent human-readable label matching the final implementation) is present in the DOM.
- An `<input type="checkbox">` element is rendered inside or adjacent to that label, bound to the shared prefs value.

Structural assertion: `grep -r 'Diagnostics logging\|diagnosticsLogging' frontend/src/app/pages/settings/settings.page.html` returns at least one match showing a `toggle-row` or equivalent labeling pattern.

---

**S-10 — Settings toggle default: no prior value → rendered checked (ON)**

Given: `localStorage` does not contain the key `meet-poc.diagnosticsLogging` (fresh state).
When: Settings page is loaded.
Then: the diagnostics toggle checkbox has `checked` state = `true` (default ON).

Structural assertion: the toggle's `[ngModel]` or binding expression resolves via `readDiagnosticsLoggingEnabled()` from the shared prefs module, so the absent-key→true contract (S-1) guarantees initial checked state. Confirm by grep: the Settings component reads the initial value from the shared prefs reader, not from a hardcoded `true`.

---

**S-11 — Settings toggle reflects persisted false after reload (structural)**

Given: `localStorage` contains `meet-poc.diagnosticsLogging` = `'0'` (disabled, as if previously toggled OFF).
When: Settings page initializes (e.g. component constructor / `ngOnInit`).
Then: the diagnostics toggle is initialized unchecked (false).

Structural assertion: Settings component seeds its toggle state via `readDiagnosticsLoggingEnabled()` from the shared module at construction time, not from a hardcoded value. Grep evidence: Settings component's diagnostics toggle binding references `readDiagnosticsLoggingEnabled` import — NOT an inline `localStorage.getItem(...)` call with a string literal key.

---

**S-12 — Toggling OFF in Settings persists immediately (structural + unit)**

Given: Settings page is visible, diagnostics toggle is currently checked (ON).
When: user clicks the toggle to turn it OFF.
Then:
- `writeDiagnosticsLoggingEnabled(false)` is called (the toggle's change handler calls the shared writer).
- Immediately after: `readDiagnosticsLoggingEnabled()` returns `false` (next read, same tab).
- `localStorage.getItem('meet-poc.diagnosticsLogging')` === `'0'` (persisted).
- No network call is made to persist this preference (local-only, per scope).

Structural assertion: Settings component's toggle `(ngModelChange)` or equivalent event handler invokes `writeDiagnosticsLoggingEnabled` from the shared module. Grep evidence: Settings component imports from `diagnostics-prefs.ts` (or equivalent shared path) and calls the writer in the change handler.

---

**S-13 — Toggling ON in Settings persists immediately (structural + unit)**

Given: Settings page is visible, diagnostics toggle is currently unchecked (OFF).
When: user clicks the toggle to turn it ON.
Then:
- `writeDiagnosticsLoggingEnabled(true)` is called.
- Immediately after: `readDiagnosticsLoggingEnabled()` returns `true`.
- `localStorage.getItem('meet-poc.diagnosticsLogging')` !== `'0'` (no longer disabled).

Structural assertion: same as S-12 — Settings component's change handler calls `writeDiagnosticsLoggingEnabled(true)`.

---

**S-14 — room.page diagnostics gates import the shared reader (single source of truth)**

Given: the shared prefs module at (e.g.) `frontend/src/app/services/diagnostics-prefs.ts` exports `readDiagnosticsLoggingEnabled`.
Then:
- `room.page.ts` does NOT define its own `readDiagnosticsLoggingEnabled` function (the private duplicate is removed).
- `room.page.ts` does NOT contain the string literal `'meet-poc.diagnosticsLogging'` as a key literal (no inline `localStorage.getItem('meet-poc.diagnosticsLogging')` calls).
- `room.page.ts` imports `readDiagnosticsLoggingEnabled` from the shared prefs module.

Structural assertions (grep):
```bash
# Must return 0 matches (no duplicate definition):
grep -n "function readDiagnosticsLoggingEnabled" frontend/src/app/pages/room/room.page.ts

# Must return 0 matches (key literal centralized in shared module only):
grep -n "'meet-poc.diagnosticsLogging'" frontend/src/app/pages/room/room.page.ts

# Must return 1+ match (shared import present):
grep -n "diagnostics-prefs\|readDiagnosticsLoggingEnabled" frontend/src/app/pages/room/room.page.ts
```

---

**S-15 — Three diagnostics gates in room.page use the shared signal/reader**

Given: `room.page.ts` has three gate sites for diagnostics (start, queue, flush):
- `startDiagnosticsLogger` (~line 2555): `if (... !this.diagnosticsLoggingEnabled()) return;`
- `queueDiagnosticsLog` (~line 2732): `if (... !this.diagnosticsLoggingEnabled()) return;`
- `flushDiagnosticsLog` (~line 2749): `if (!sessionId || !this.diagnosticsLoggingEnabled()) return;`

Then: all three gate sites reference `this.diagnosticsLoggingEnabled()` which is the signal seeded from the shared reader. None of the three gate sites contain an inline `localStorage.getItem` call.

Structural assertion:
```bash
# Must show 3 matches (three gate sites, all via the signal):
grep -c "diagnosticsLoggingEnabled()" frontend/src/app/pages/room/room.page.ts
# Expected: 3 (or more if the signal is used elsewhere — must be >= 3)

# Must return 0 matches (no inline localStorage at gate sites):
grep -n "diagnosticsLogTimer\|queueDiagnosticsLog\|flushDiagnosticsLog" frontend/src/app/pages/room/room.page.ts \
  | head -5
# Verify none of those lines also contain localStorage.getItem inline
```

---

**S-16 — NS5 manual note: live call, toggle OFF stops POSTs to diagnostics endpoint**

> Manual localhost verification only. Headless cannot fully drive a live WebRTC call.

Steps:
1. Open `http://localhost:4700`, log in, join a room (two tabs or two browsers to get to in-call state).
2. Open DevTools Network panel, filter by `/api/meeting-sessions`.
3. Observe periodic POST requests to `/api/meeting-sessions/:id/diagnostics` (confirms baseline ON behavior).
4. Navigate to Settings (`/app/settings`), locate the diagnostics toggle (expected label: "Diagnostics logging" or equivalent), toggle it OFF.
5. Return to the call. Wait at least 15 seconds (two `DIAGNOSTICS_LOG_INTERVAL_MS` = 7.5s cycles).
6. Verify: NO new POST requests to `/api/meeting-sessions/:id/diagnostics` appear in the Network panel after the toggle was set OFF.
7. Toggle the control back ON (in Settings, or a new tab navigated to Settings).
8. Return to the call. Wait at least 15 seconds.
9. Verify: POST requests to `/api/meeting-sessions/:id/diagnostics` resume.

Expected result (step 6): zero new diagnostics POST requests while toggle is OFF. The three gate sites in `room.page.ts` (start / queue / flush) each short-circuit when `diagnosticsLoggingEnabled()` is false.
Expected result (step 9): periodic POST requests resume once the toggle is restored to ON.

Note: the toggle state is localStorage-persisted. If settings navigation causes the in-call page to unmount, verify the signal is re-seeded from localStorage on remount (or the signal is in a shared service that survives navigation).

---

### Out of scope for B3a

- Backend diagnostics feature flag, admin toggle, `/api/me` user preference, migrations — deferred to B3b.
- B2 audio watchdog paths (mic sweep, silent-mic banner) — separate feature, no change.
- Any new Settings tab — the toggle should be added as a row in an existing Settings tab (Account or a new "Diagnostics" section within an existing tab), not as a new top-level tab unless clearly cleaner.

---

### Run command (unit proof, Criteria S-1 through S-8)

```bash
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/diagnostics-prefs.spec.ts
```

Expected output:
```
diagnostics-prefs: all assertions passed
```

Exit code: 0. Any assertion failure = exit code 1 with a descriptive error from `node:assert/strict`.

---

STATUS: DONE (scenarios written — B3a section; B3b will append below this line)

---

## B3b (R5) — global/admin diagnostics kill-switch

**Requirement (verbatim):** "R5 — Global/admin diagnostics kill-switch. A master switch (admin/global) so diagnostics can be turned off globally. When OFF: backend stops accepting/persisting diagnostics AND clients learn to stop collecting (via the existing config/me surface). Reuses existing admin auth — NO new auth/RBAC boundary."

**North-star NS8:** Reuse the existing admin module + auth; it is a feature toggle, NOT a new RBAC boundary.

**JROM (verbatim):** "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

**Scope:** backend migration + admin API routes + POST gate + /api/me field + frontend AuthService signal + room.page effective-gate + minimal admin UI toggle. No new auth/RBAC middleware. No general settings editor.

**Backend test runner:** `cd /home/agjrom/websites/meet-poc/backend && npx vitest run tests/admin-diagnostics-killswitch.test.ts`
(targeted; full suite: `npx vitest run`)

**Frontend unit runner:** `cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/diagnostics-global-flag.spec.ts`
(mirrors `diagnostics-prefs.spec.ts` style: `node:assert/strict`, top-level assertion blocks, single `console.log` at end)

---

### Scenario → Proof Mapping

| Criteria | Proof type | Artifact |
|---|---|---|
| A-1 (migration idempotency) | Backend vitest — `runMigrations` twice on in-memory DB via `createTestDb()` | `admin-diagnostics-killswitch.test.ts` |
| A-2 (default ON — absent row) | Backend vitest — read flag with no `app_settings` row | `admin-diagnostics-killswitch.test.ts` |
| A-3 (admin PUT/GET round-trip) | Backend vitest — PUT false, read false; PUT true, read true; assert `updated_at` present | `admin-diagnostics-killswitch.test.ts` |
| A-4 (requireAdmin enforced) | Backend vitest — GET/PUT without admin session ⇒ 403 (no cookie ⇒ 401, non-admin ⇒ 403) | `admin-diagnostics-killswitch.test.ts` |
| A-5 (POST gate ON — row inserted) | Backend vitest — global ON, admitted poster POST ⇒ 200, row IS present | `admin-diagnostics-killswitch.test.ts` |
| A-6 (POST gate OFF — no row) | Backend vitest — global OFF, admitted poster POST ⇒ 200 `{ok:true,persisted:false}`, row count unchanged | `admin-diagnostics-killswitch.test.ts` |
| A-7 (admit check precedes global gate) | Backend vitest — global OFF, non-admitted poster ⇒ 403 regardless | `admin-diagnostics-killswitch.test.ts` |
| A-8 (/api/me carries flag — both paths) | Backend vitest — guest path `{user:null, diagnosticsGloballyEnabled:<bool>}`; signed-in path includes field | `admin-diagnostics-killswitch.test.ts` |
| B-1 (effective-gate truth table) | Frontend tsx unit — pure-function test of 4 input combinations | `diagnostics-global-flag.spec.ts` |
| B-2 (AuthService default + /api/me binding) | Structural grep — `diagnosticsGloballyEnabled` signal initialized `true`, set from `res.diagnosticsGloballyEnabled ?? true` | File-level grep evidence |
| B-3 (room.page 3 gates use AND) | Structural grep — gate expressions reference both signals; no gate is single-signal | File-level grep evidence |
| B-4 (adminGuard reuse + admin.service new methods) | Structural grep — admin page route uses `adminGuard`; `AdminService` has `getDiagnosticsEnabled` + `setDiagnosticsEnabled` calling `/api/admin/settings/diagnostics` | File-level grep evidence |
| C-1 (manual end-to-end) | Manual localhost note (NS5) | Notes in independent-validation.md |
| C-2 (mid-session flip documented) | Documented behavior — backend-gate-authoritative, client stops on next room entry | Scenario text (this file) |

---

### A — Backend (vitest, deterministic)

**A-1 — Migration idempotency: `app_settings` table is created; running migrations twice does not throw**

Given: a fresh in-memory test database created via `createTestDb()` (which calls `runMigrations`).
When: `runMigrations(db)` is called a second time on the same database instance.
Then:
- No exception is thrown on either call.
- `SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'` returns exactly one row with `name = 'app_settings'`.
- The `app_settings` table has columns `key TEXT PRIMARY KEY`, `value TEXT NOT NULL`, `updated_at INTEGER NOT NULL` (assert via `PRAGMA table_info(app_settings)`).
- The `_migrations` table contains a row for `0012_app_settings.sql` exactly once (no duplicate).

Assertions:
```ts
const db = createTestDb(); // first runMigrations call is inside createTestDb
assert.doesNotThrow(() => runMigrations(db), 'second runMigrations must not throw');

const tableRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get();
assert.ok(tableRow, 'app_settings table must exist after migration');

const cols = db.prepare('PRAGMA table_info(app_settings)').all() as { name: string }[];
const colNames = cols.map((c) => c.name);
assert.ok(colNames.includes('key'), 'must have key column');
assert.ok(colNames.includes('value'), 'must have value column');
assert.ok(colNames.includes('updated_at'), 'must have updated_at column');

const migrationRows = db.prepare("SELECT name FROM _migrations WHERE name = '0012_app_settings.sql'").all();
assert.strictEqual(migrationRows.length, 1, 'migration recorded exactly once');
```

---

**A-2 — Default ON: no `app_settings` row ⇒ diagnostics flag reads `true`**

Given: a fresh test database (migrations applied, no rows in `app_settings`).
When: the store helper `getDiagnosticsGloballyEnabled(db)` is called.
Then: returns `true`.

Note: "Row absent ⇒ global = ON" is the design invariant. The store helper must not insert a default row on read.

Assertions:
```ts
const db = createTestDb();
// confirm app_settings is empty
const count = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
assert.strictEqual(count, 0, 'precondition: no rows');

const result = getDiagnosticsGloballyEnabled(db);
assert.strictEqual(result, true, 'absent row -> true (default ON)');

// read did not insert a row
const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
assert.strictEqual(countAfter, 0, 'read must not insert a row');
```

---

**A-3 — Admin PUT sets flag; subsequent read reflects it; `updated_at` is persisted (round-trip)**

Given: a fresh test database; an admin session cookie for `jrom@silverjrom.app` (seeded via `seedUser(db)`).
When: `PUT /api/admin/settings/diagnostics` with body `{enabled: false}` using the admin cookie.
Then:
- Response: HTTP 200, body `{enabled: false}`.
- `getDiagnosticsGloballyEnabled(db)` returns `false`.
- `app_settings` has exactly one row with `key = 'diagnostics_globally_enabled'`, `value = '0'`, and `updated_at > 0`.

When: `PUT /api/admin/settings/diagnostics` with body `{enabled: true}` using the admin cookie.
Then:
- Response: HTTP 200, body `{enabled: true}`.
- `getDiagnosticsGloballyEnabled(db)` returns `true`.
- `app_settings` row `value = '1'`.

Assertions:
```ts
const db = createTestDb();
seedUser(db);
const app = createApp(db);
const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;

// PUT false
const res1 = await request(app)
  .put('/api/admin/settings/diagnostics')
  .set('Cookie', adminCookie)
  .send({ enabled: false })
  .expect(200);
assert.strictEqual(res1.body.enabled, false, 'PUT false -> response.enabled false');
assert.strictEqual(getDiagnosticsGloballyEnabled(db), false, 'PUT false -> read false');

const row = db.prepare("SELECT value, updated_at FROM app_settings WHERE key = 'diagnostics_globally_enabled'").get() as { value: string; updated_at: number };
assert.ok(row, 'row must be present after PUT');
assert.strictEqual(row.value, '0', "persisted value is '0' for false");
assert.ok(row.updated_at > 0, 'updated_at is a positive integer timestamp');

// PUT true
const res2 = await request(app)
  .put('/api/admin/settings/diagnostics')
  .set('Cookie', adminCookie)
  .send({ enabled: true })
  .expect(200);
assert.strictEqual(res2.body.enabled, true, 'PUT true -> response.enabled true');
assert.strictEqual(getDiagnosticsGloballyEnabled(db), true, 'PUT true -> read true');

const row2 = db.prepare("SELECT value FROM app_settings WHERE key = 'diagnostics_globally_enabled'").get() as { value: string };
assert.strictEqual(row2.value, '1', "persisted value is '1' for true");

// confirm still exactly one row (upsert, not insert-dup)
const rowCount = (db.prepare('SELECT COUNT(*) AS n FROM app_settings').get() as { n: number }).n;
assert.strictEqual(rowCount, 1, 'upsert: still exactly one app_settings row');
```

---

**A-4 — `requireAdmin` enforced on GET and PUT `/api/admin/settings/diagnostics`**

Given: a fresh test database; `jrom@silverjrom.app` is seeded (isAdmin = 1 per migration 0010); a second non-admin user `plain@example.com` is inserted with `is_admin = 0`.

When: GET `/api/admin/settings/diagnostics` with no cookie.
Then: HTTP 401.

When: GET `/api/admin/settings/diagnostics` with a non-admin session cookie.
Then: HTTP 403.

When: GET `/api/admin/settings/diagnostics` with an admin session cookie.
Then: HTTP 200, body has field `enabled` (boolean).

When: PUT `/api/admin/settings/diagnostics` with no cookie.
Then: HTTP 401.

When: PUT `/api/admin/settings/diagnostics` with a non-admin session cookie, body `{enabled:false}`.
Then: HTTP 403.

When: PUT `/api/admin/settings/diagnostics` with an admin session cookie, body `{enabled:false}`.
Then: HTTP 200.

Assertions (summary form — follow `adminRouter` test patterns from `admin.test.ts`):
```ts
const db = createTestDb();
seedUser(db); // jrom@silverjrom.app, isAdmin=1
db.prepare('INSERT INTO users (email, password_hash, created_at, updated_at, is_admin) VALUES (?, ?, ?, ?, ?)')
  .run('plain@example.com', '00:00', Date.now(), Date.now(), 0);
const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
const plainCookie = `session=${createSession('plain@example.com', db)}`;
const app = createApp(db);

await request(app).get('/api/admin/settings/diagnostics').expect(401);
await request(app).get('/api/admin/settings/diagnostics').set('Cookie', plainCookie).expect(403);
const getRes = await request(app).get('/api/admin/settings/diagnostics').set('Cookie', adminCookie).expect(200);
assert.ok(typeof getRes.body.enabled === 'boolean', 'GET returns {enabled: boolean}');

await request(app).put('/api/admin/settings/diagnostics').send({ enabled: false }).expect(401);
await request(app).put('/api/admin/settings/diagnostics').set('Cookie', plainCookie).send({ enabled: false }).expect(403);
await request(app).put('/api/admin/settings/diagnostics').set('Cookie', adminCookie).send({ enabled: false }).expect(200);
```

Note: no new middleware is created. The test confirms that `requireAdmin` (from `backend/src/modules/auth/middleware.ts:22`) is the sole auth check on these routes — no additional guard.

---

**A-5 — POST gate ON (default): admitted poster ⇒ 200 AND row IS inserted**

Given: global flag is ON (default — no row in `app_settings`); an admitted owner session exists (use the WS join pattern from `session-diagnostics.test.ts`).
When: the owner POSTs a valid diagnostics payload to `/api/meeting-sessions/:sessionId/diagnostics`.
Then:
- HTTP 200.
- Response body has `ok: true` and `entry` object (same as before; the existing B3a/DR-28 behavior is unchanged).
- `SELECT COUNT(*) FROM meeting_session_diagnostics WHERE session_id = ?` returns 1 (row was inserted).

Assertions:
```ts
// [setup: seedUser, createRoom, WS join → ownerAdmitted, sessionId — identical to DR-28 preamble]
const countBefore = (db.prepare('SELECT COUNT(*) AS n FROM meeting_session_diagnostics WHERE session_id = ?').get(sessionId) as { n: number }).n;
assert.strictEqual(countBefore, 0, 'precondition: no entries');

const res = await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .set('Cookie', ownerCookie)
  .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
  .expect(200);
assert.strictEqual(res.body.ok, true);
assert.ok(res.body.entry, 'entry object present');

const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM meeting_session_diagnostics WHERE session_id = ?').get(sessionId) as { n: number }).n;
assert.strictEqual(countAfter, 1, 'global ON -> row inserted');
```

---

**A-6 — POST gate OFF: admitted poster ⇒ 200 `{ok:true,persisted:false}` AND no row inserted**

Given: global flag is OFF (set via `setDiagnosticsGloballyEnabled(false, db)` directly, or via PUT — both must work; use the store helper for determinism in a unit test); an admitted owner session exists.
When: the owner POSTs a valid diagnostics payload.
Then:
- HTTP 200.
- Response body is exactly `{ok: true, persisted: false}` (no `entry` key).
- Row count in `meeting_session_diagnostics` for this session is unchanged (0 after 0, or N after N if prior entries exist).

Assertions:
```ts
// [setup: seedUser, createRoom, WS join → ownerAdmitted, sessionId]
// set global OFF via store helper before the POST
setDiagnosticsGloballyEnabled(false, db);

const countBefore = (db.prepare('SELECT COUNT(*) AS n FROM meeting_session_diagnostics WHERE session_id = ?').get(sessionId) as { n: number }).n;

const res = await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .set('Cookie', ownerCookie)
  .send(samplePayload({ clientId: ownerAdmitted.clientId, participantId: ownerAdmitted.participantId }))
  .expect(200);
assert.deepStrictEqual(res.body, { ok: true, persisted: false }, 'global OFF -> no-op response');

const countAfter = (db.prepare('SELECT COUNT(*) AS n FROM meeting_session_diagnostics WHERE session_id = ?').get(sessionId) as { n: number }).n;
assert.strictEqual(countAfter, countBefore, 'global OFF -> row count unchanged (no insert)');
```

---

**A-7 — Admit check precedes global gate: non-admitted poster ⇒ 403 regardless of global flag**

Given: global flag is OFF.
When: a non-admitted client (no valid `clientId`/`clientKey` in `admitted_participants`) POSTs to the diagnostics endpoint.
Then: HTTP 403 (the `isAdmittedDiagnosticPoster` gate fires first; the global flag is not reached).

Assertions:
```ts
setDiagnosticsGloballyEnabled(false, db);

await request(server)
  .post(`/api/meeting-sessions/${sessionId}/diagnostics`)
  .send(samplePayload({ clientId: 'never-admitted', participantId: 'never-participant', clientKey: 'bad-key' }))
  .expect(403);
```

Note: order of gates in the handler is: `isAdmittedDiagnosticPoster` check (:151) → global flag check → `appendDiagnosticsEntry` (:160). The 403 must be returned without consulting `app_settings` when the poster is not admitted.

---

**A-8 — `/api/me` carries `diagnosticsGloballyEnabled` on BOTH the guest and signed-in paths**

**A-8a — Guest path (no session)**

Given: no session cookie; global flag is ON (default).
When: `GET /api/me` with no cookie.
Then: HTTP 200, body is `{user: null, diagnosticsGloballyEnabled: true}`.

**A-8b — Guest path, flag OFF**

Given: global flag is OFF (`setDiagnosticsGloballyEnabled(false, db)`); no session cookie.
When: `GET /api/me`.
Then: HTTP 200, body is `{user: null, diagnosticsGloballyEnabled: false}`.

**A-8c — Signed-in path, flag ON**

Given: valid admin session; global flag is ON.
When: `GET /api/me` with the admin cookie.
Then: HTTP 200, body has `user.email = 'jrom@silverjrom.app'` AND `diagnosticsGloballyEnabled: true` (top-level field, not nested under `user`).

**A-8d — Signed-in path, flag OFF**

Given: valid admin session; global flag is OFF.
When: `GET /api/me` with the admin cookie.
Then: HTTP 200, body has `user` object AND `diagnosticsGloballyEnabled: false`.

**A-8e — Fail-open: store read throws ⇒ `diagnosticsGloballyEnabled: true`**

Given: the `app_settings` store read is patched to throw; session present or absent.
When: `GET /api/me`.
Then: HTTP 200, `diagnosticsGloballyEnabled: true` (fail-open default).

Assertions (A-8a and A-8b shown; A-8c/d follow same pattern):
```ts
const db = createTestDb();
seedUser(db);
const app = createApp(db);

// A-8a: default ON, no cookie
const r1 = await request(app).get('/api/me').expect(200);
assert.strictEqual(r1.body.user, null, 'guest: user is null');
assert.strictEqual(r1.body.diagnosticsGloballyEnabled, true, 'guest: flag true by default');

// A-8b: flag OFF, no cookie
setDiagnosticsGloballyEnabled(false, db);
const r2 = await request(app).get('/api/me').expect(200);
assert.strictEqual(r2.body.user, null);
assert.strictEqual(r2.body.diagnosticsGloballyEnabled, false, 'guest: flag false when OFF');

// A-8c: flag ON, signed in
setDiagnosticsGloballyEnabled(true, db);
const adminCookie = `session=${createSession('jrom@silverjrom.app', db)}`;
const r3 = await request(app).get('/api/me').set('Cookie', adminCookie).expect(200);
assert.ok(r3.body.user, 'signed-in: user present');
assert.strictEqual(r3.body.diagnosticsGloballyEnabled, true, 'signed-in: flag true');

// A-8d: flag OFF, signed in
setDiagnosticsGloballyEnabled(false, db);
const r4 = await request(app).get('/api/me').set('Cookie', adminCookie).expect(200);
assert.strictEqual(r4.body.diagnosticsGloballyEnabled, false, 'signed-in: flag false when OFF');
```

---

### B — Frontend (tsx logic + structural)

**B-1 — Effective-gate truth table: `userToggle AND globalEnabled` — all four combinations**

Given: a pure helper function `computeEffectiveDiagnosticsEnabled(userEnabled: boolean, globalEnabled: boolean): boolean` (or equivalent inline computed expression that the spec exercises directly).

| userEnabled | globalEnabled | Expected result |
|-------------|---------------|-----------------|
| `true`      | `true`        | `true` (collect) |
| `true`      | `false`       | `false` (stop)   |
| `false`     | `true`        | `false` (stop)   |
| `false`     | `false`       | `false` (stop)   |

Only `(true, true)` ⇒ `true`. All other combinations ⇒ `false`.

Assertions (in `diagnostics-global-flag.spec.ts`, `node:assert/strict`, top-level blocks):
```ts
import assert from 'node:assert/strict';
import { computeEffectiveDiagnosticsEnabled } from './diagnostics-prefs.js';
// OR: test inline `(userEnabled && globalEnabled)` if the effective gate
// is a pure computed — adjust import to match the final implementation.

assert.strictEqual(computeEffectiveDiagnosticsEnabled(true, true),   true,  '(ON, ON) -> collect');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(true, false),  false, '(ON, OFF) -> stop');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(false, true),  false, '(OFF, ON) -> stop');
assert.strictEqual(computeEffectiveDiagnosticsEnabled(false, false), false, '(OFF, OFF) -> stop');

console.log('diagnostics-global-flag: all assertions passed');
```

Exit code: 0. Any failure ⇒ exit 1 with assertion message.

Note: if the implementer exposes the truth table as a `computed` signal rather than a named export, the spec tests the underlying `signal().value` combinations using the same `MemoryStorage` shim pattern from `diagnostics-prefs.spec.ts`.

---

**B-2 — AuthService stores `diagnosticsGloballyEnabled` from `/api/me`; defaults `true` (fail-open) (structural)**

Assertion (grep):
```bash
# 1. Signal exists and defaults true:
grep -n "diagnosticsGloballyEnabled" frontend/src/app/services/auth.service.ts
# Expected: a line with `signal(true)` or `signal<boolean>(true)` assigned to diagnosticsGloballyEnabled

# 2. MeResponse type includes the field:
grep -n "diagnosticsGloballyEnabled" frontend/src/app/services/auth.service.ts
# Expected: MeResponse type definition includes `diagnosticsGloballyEnabled?: boolean`

# 3. checkSession sets the signal from res.diagnosticsGloballyEnabled (fail-open ?? true):
grep -n "diagnosticsGloballyEnabled" frontend/src/app/services/auth.service.ts
# Expected: a line containing `res.diagnosticsGloballyEnabled ?? true`
# (the ?? true ensures fail-open if the field is absent or the fetch errors)
```

Expected result: at least 3 matches for `diagnosticsGloballyEnabled` in `auth.service.ts` —
- one for the `signal(true)` declaration
- one for the `MeResponse` type
- one for the `?? true` assignment inside `checkSession`

If the signal is set in both the success and catch paths, there must be a `?? true` (or equivalent default `true`) in BOTH paths.

---

**B-3 — `room.page.ts` three gate sites reference the effective (AND) value; no gate is single-signal (structural)**

The three gate sites are:
- `startDiagnosticsLogger` (~line 2555)
- `queueDiagnosticsLog` (~line 2732)
- `flushDiagnosticsLog` (~line 2749)

After B3b, each gate must evaluate the AND of both signals, not `diagnosticsLoggingEnabled()` alone.

Assertion (grep):
```bash
# Option A — the three sites reference a shared effectiveDiagnosticsEnabled computed signal:
grep -n "effectiveDiagnosticsEnabled\(\)" frontend/src/app/pages/room/room.page.ts
# Expected: >= 3 matches (one per gate site)

# Option B — the three sites use the direct AND expression inline:
grep -n "diagnosticsLoggingEnabled() && " frontend/src/app/pages/room/room.page.ts
# Expected: >= 3 matches

# Either option is valid. The following must return 0 (bare single-signal gates removed):
grep -n "!this\.diagnosticsLoggingEnabled()" frontend/src/app/pages/room/room.page.ts
# Expected: 0 matches (the bare `!this.diagnosticsLoggingEnabled()` guards are gone —
# replaced by the effective-gate form that ANDs both signals)
```

Note: if the implementer uses a computed `effectiveDiagnosticsEnabled = computed(() => diagnosticsLoggingEnabled() && auth.diagnosticsGloballyEnabled())` declared in the component, the grep for `effectiveDiagnosticsEnabled()` with >= 3 matches is the proof. If the AND is inlined at each site, the second grep form applies. The last grep (bare single-signal) must return 0 in both cases.

---

**B-4 — `adminGuard` reused for admin diagnostics toggle; `AdminService` has new diagnostics methods; admin UI toggle calls the correct endpoint (structural)**

**B-4a — adminGuard reuse (admin page route)**

Assertion:
```bash
# The admin page route (in app.routes.ts or admin module routing) must list adminGuard:
grep -rn "adminGuard" frontend/src/app/
# Expected: >= 2 matches — one in admin.guard.ts (definition) + at least one in a routes file
```

**B-4b — AdminService has `getDiagnosticsEnabled` and `setDiagnosticsEnabled` methods calling `/api/admin/settings/diagnostics`**

Assertion:
```bash
grep -n "getDiagnosticsEnabled\|setDiagnosticsEnabled\|/api/admin/settings/diagnostics" frontend/src/app/services/admin.service.ts
# Expected:
# - 1 match for getDiagnosticsEnabled (GET method calling /api/admin/settings/diagnostics)
# - 1 match for setDiagnosticsEnabled (PUT method calling /api/admin/settings/diagnostics)
# - At minimum 2 matches for '/api/admin/settings/diagnostics' (one per method)
```

**B-4c — Admin page template has a diagnostics toggle (labeled, single toggle — no general settings editor)**

Assertion:
```bash
grep -n "diagnostics\|Diagnostics" frontend/src/app/pages/admin/admin.page.html
# Expected: >= 1 match showing a toggle/checkbox input with a Diagnostics label
# Must NOT contain a generic key/value settings table or editor pattern
```

**B-4d — Admin page component calls `AdminService` diagnostics methods; no inline HTTP in the component**

Assertion:
```bash
grep -n "getDiagnosticsEnabled\|setDiagnosticsEnabled" frontend/src/app/pages/admin/admin.page.ts
# Expected: >= 1 match (component delegates to AdminService — no direct HttpClient call for this toggle)

# Confirm no inline HTTP for the diagnostics toggle:
grep -n "admin/settings/diagnostics" frontend/src/app/pages/admin/admin.page.ts
# Expected: 0 matches (the URL lives only in admin.service.ts)
```

---

### C — Manual (NS5, non-blocking)

**C-1 — Admin UI toggle end-to-end on localhost:4700**

> Manual localhost verification only. Headless cannot fully drive a live WebRTC call.

Steps:
1. Open `http://localhost:4700`, log in as `jrom@silverjrom.app` (admin).
2. Navigate to the Admin page (route containing `adminGuard`).
3. Locate the "Diagnostics logging" toggle (or equivalent labeled control). Confirm it is checked ON (default).
4. Open a second tab, join a room (two-tab call to reach in-call state). Open DevTools Network panel, filter by `/api/meeting-sessions`. Observe periodic POST requests to `/api/meeting-sessions/:id/diagnostics` confirming baseline ON.
5. Return to the Admin tab. Toggle the diagnostics switch OFF. Confirm the toggle shows OFF state and no error banner appears.
6. Call `GET /api/admin/settings/diagnostics` directly (DevTools or curl with session cookie). Confirm response is `{enabled: false}`.
7. In the second tab (in-call), POST a new diagnostics payload manually (or wait for the periodic flush). Verify the response is `{ok: true, persisted: false}` (not `{ok: true, entry: {...}}`). Verify no new row in `meeting_session_diagnostics` (use `/api/meeting-sessions/:id/diagnostics` — count should not increase).
8. Close the room and re-enter from the same tab (triggering a new `checkSession` → `/api/me` on room page load). Confirm: `GET /api/me` response now includes `diagnosticsGloballyEnabled: false`. Confirm: no new diagnostics POSTs are initiated after room entry (the effective gate is false because `auth.diagnosticsGloballyEnabled()` is false).
9. Return to the Admin tab. Toggle diagnostics back ON.
10. Re-enter the room again. Confirm diagnostics POSTs resume.

Expected results:
- Step 5: toggle shows OFF; no console error or HTTP error in the admin page.
- Step 6: `{enabled: false}`.
- Step 7: POST returns `{ok: true, persisted: false}` (not a 4xx).
- Step 8: `/api/me` has `diagnosticsGloballyEnabled: false`; no new diagnostics collection after room entry.
- Step 10: diagnostics POSTs resume after toggle restored to ON and room re-entered.

---

**C-2 — Mid-session flip: backend-gate-authoritative (documented behavior, not a live-push feature)**

> This scenario documents INTENDED behavior, not a defect. No live server→client push is built.

Design decision: if a client is already in-call when an admin flips the global flag OFF, the client will CONTINUE posting diagnostics payloads until its next `/api/me` fetch (which occurs at room page load, i.e., next room entry — `room.page.ts:607 checkSession`). HOWEVER:
- The backend gate takes effect IMMEDIATELY on the next POST: the handler checks `getDiagnosticsGloballyEnabled(db)` at request time and returns `{ok:true, persisted:false}` with no row inserted.
- The mid-session window (between admin flip and client's next room entry) produces no data persistence — the backend is the authoritative kill regardless of client behavior.
- There is no WebSocket push, no Server-Sent Event, and no polling mechanism to propagate the flag change to currently-connected clients in real time. This is intentional (NS8: feature toggle, not a new subscription channel).

Assertion (structural — verify no push mechanism was added):
```bash
# No new SSE or WS message type for the global flag:
grep -rn "diagnosticsGlobal\|diagnostics_globally\|killswitch\|kill-switch" backend/src/modules/signaling/
# Expected: 0 matches (the flag is not sent over the WS signaling channel)

grep -rn "diagnosticsGloballyEnabled" backend/src/modules/
# Expected: matches only in admin/ (GET/PUT routes) and sessions/ (POST gate) and auth/ (/api/me) — NOT in signaling/
```

Reviewer note in independent-validation.md: confirm the above grep returns 0 matches in `backend/src/modules/signaling/`. Document this as the intentional mid-session window and confirm it is acceptable per JROM's requirement ("when we are at a certain point we can just off these" — applies to new data, not to live call interruption).

---

### Run commands

**Backend (load-bearing proof — Criteria A-1 through A-8):**
```bash
cd /home/agjrom/websites/meet-poc/backend && npx vitest run tests/admin-diagnostics-killswitch.test.ts
```
Expected: all tests pass, exit code 0.

Full suite (regression check):
```bash
cd /home/agjrom/websites/meet-poc/backend && npx vitest run
```

**Frontend truth-table unit (Criterion B-1):**
```bash
cd /home/agjrom/websites/meet-poc/frontend && npx tsx src/app/services/diagnostics-global-flag.spec.ts
```
Expected output:
```
diagnostics-global-flag: all assertions passed
```
Exit code: 0.

**Frontend structural (Criteria B-2 through B-4) — run as grep commands from repo root:**
```bash
cd /home/agjrom/websites/meet-poc && grep -n "diagnosticsGloballyEnabled" frontend/src/app/services/auth.service.ts
cd /home/agjrom/websites/meet-poc && grep -n "effectiveDiagnosticsEnabled\(\)\|diagnosticsLoggingEnabled() &&" frontend/src/app/pages/room/room.page.ts
cd /home/agjrom/websites/meet-poc && grep -n "!this\.diagnosticsLoggingEnabled()" frontend/src/app/pages/room/room.page.ts
cd /home/agjrom/websites/meet-poc && grep -n "getDiagnosticsEnabled\|setDiagnosticsEnabled\|/api/admin/settings/diagnostics" frontend/src/app/services/admin.service.ts
```

---

### Out of scope for B3b

- B3a user-toggle behavior — unchanged. B3b only ADDS the AND of the global signal. The user `diagnosticsLoggingEnabled` localStorage pref and its read/write/signal contract are not modified.
- General admin settings editor — the admin GET/PUT routes are scoped to the diagnostics flag ONLY. No key/value store editor UI.
- New auth/RBAC middleware — `requireAdmin` from `backend/src/modules/auth/middleware.ts:22` is the sole auth check.
- Live push to in-call clients — documented as intentional in C-2.
- B2 audio watchdog paths (mic sweep, silent-mic banner) — no change.

---

STATUS: DONE
