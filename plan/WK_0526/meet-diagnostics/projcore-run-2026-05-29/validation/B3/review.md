# B3 — Code Review

> Append-only per batch. B3a (R4) below. B3b appends its own section beneath — do NOT clobber.

---

## B3a (R4) — User-level diagnostics on/off toggle

**Reviewed:** `git diff 2c062ff..477d9a4` (HEAD = 477d9a4). Diff is truth; changes.md cross-checked against it.

### Verdict

**STATUS: DONE (APPROVE)** — R4 fully implemented, single-source-of-truth invariant holds, reader contract preserved byte-for-byte, all structural greps + the unit spec pass independently. No scope violations, no dead code, no deferral markers.

### Diff Summary (git diff --stat)

```
 account-settings.component.html | 16 +++
 account-settings.component.scss | 17 +++
 account-settings.component.ts   | 10 ++
 frontend/src/app/pages/room/room.page.ts | 10 +-
 frontend/src/app/services/diagnostics-prefs.spec.ts | 120 +++++++++++++
 frontend/src/app/services/diagnostics-prefs.ts      |  42 ++++++
 .../validation/B3/changes.md                        | 107 ++++++++++++
 7 files changed, 313 insertions(+), 9 deletions(-)
```

Only the 6 expected source files (+ changes.md) are touched. Net +9 lines of real source removal/addition in room.page.ts (1 import added, 1 const deleted, 7-line private reader deleted).

### Codex-Template Section Check (changes.md "## B3a (R4)")

| Section | Present | Note |
|---|---|---|
| User Report (verbatim) | YES | R4 + JROM quote, both verbatim |
| Root Cause (feature what+where) | YES | Acceptable feature-statement per dev.md — mechanism-level: identifies the flag had no setter/UI and the key/reader lived privately in room.page.ts, blocking a shared Settings control |
| Code Changes (per-file WHAT+WHY) | YES | All 6 files documented with what + why |
| Verification (build PASS + smoke) | YES | Unit spec PASS, reference spec PASS, FE build PASS, BE build PASS; structural greps + smoke walk |
| Caveats | YES | S-16 manual-only, cross-tab freshness, per-device persistence, pre-existing build warnings |

All required sections present and in order. No REVISE trigger here.

### Scenario Coverage + Brief Anchoring

| Scenario | Brief field | Evidence (verified) | Status |
|---|---|---|---|
| S-1 absent→true | Reader contract (absent⇒true) | Unit spec passes; reader is `getItem(KEY) !== '0'` | PASS |
| S-2 '0'→false | Reader contract ('0'⇒false) | Unit spec passes | PASS |
| S-3 '1'→true | Reader contract (else⇒true) | Unit spec passes | PASS |
| S-4 non-'0'→true | Reader contract (else⇒true) | Unit spec passes ('yes'→true) | PASS |
| S-5 throw→true | Reader contract (throw⇒true) | Unit spec passes (getItem override throws, no propagation) | PASS |
| S-6 write(false)→'0' | Writer (false⇒'0') | Unit spec passes; setItem(KEY,'0') | PASS |
| S-7 write(true)→non-'0' | Writer (true⇒non-'0') | Unit spec passes; setItem(KEY,'1') | PASS |
| S-8 round-trip stable | Writer round-trip | Unit spec passes | PASS |
| S-9 labeled toggle renders | Visible LABELED toggle | `<label class="toggle-row">…Diagnostics logging` + checkbox, html:142-156 | PASS |
| S-10 default ON | Seeded from reader, not literal true | `signal(readDiagnosticsLoggingEnabled())` ts:51; absent⇒true ⇒ checked | PASS |
| S-11 persisted false reflects | Seeded from reader | Same line — reader-seeded, no inline literal key | PASS |
| S-12 toggle OFF persists | Change handler calls writer | `setDiagnosticsLogging` → `writeDiagnosticsLoggingEnabled($event)` ts:151-154 | PASS |
| S-13 toggle ON persists | Change handler calls writer | Same handler; `(ngModelChange)` bound | PASS |
| S-14 room.page imports shared reader | Delete private reader+const, import shared | grep: `function readDiagnosticsLoggingEnabled`=0, `'meet-poc.diagnosticsLogging'`=0, `DIAGNOSTICS_LOGGING_STORAGE_KEY`=0, `diagnostics-prefs`=1 | PASS |
| S-15 3 gates use signal | Gates unchanged, via signal | grep `diagnosticsLoggingEnabled()`=4 (3 gates @2555/2732/2749 + 1 debug-snapshot field @502); no inline localStorage at gate sites | PASS |
| S-16 live POST start/stop | (Manual NS5) | Correctly deferred to manual; not required headless. Deterministic proof = unit spec + grep is sufficient | DEFERRED (per brief) |

Every diff change traces to a brief field. No out-of-scope changes.

### Code Quality

- `diagnostics-prefs.ts`: reader is byte-for-byte identical to the deleted room.page.ts reader (`window.localStorage.getItem(KEY) !== '0'` in try/catch returning `true` on throw) — the load-bearing absent⇒enabled contract is preserved exactly. Writer is symmetric and try/catch-guarded (swallows; no throw to UI handler). Doc comment states the full contract. Clean.
- `room.page.ts`: private const + private 7-line reader deleted (not commented out — verified GONE). Single import added. Signal `diagnosticsLoggingEnabled = signal(readDiagnosticsLoggingEnabled())` (line 225) now seeds from the shared import. Three gates untouched and still short-circuit on the signal.
- `account-settings.component.ts`: signal seeded from reader (not hardcoded true), `setDiagnosticsLogging` sets signal + persists. FormsModule already imported (line 3/13), so `[ngModel]`/`(ngModelChange)` resolve.
- HTML/SCSS: reuses the established `account-divider` / `account-field` / `field-hint` pattern; `.toggle-row` scss rule is genuinely new in this component (0 prior matches at 2c062ff — not a duplicate), needed because the component is view-encapsulated.

### Convention Conformance

- Spec mirrors `mic-energy.spec.ts` style: `node:assert/strict`, in-memory localStorage shim, top-level assertion blocks, single terminal `console.log`. Runs clean: `diagnostics-prefs: all assertions passed`, exit 0.
- Spec imports `./diagnostics-prefs.js` after installing the shim (correct ordering; ESM `.js` specifier for tsx).
- Signal-binding via `[ngModel]`/`(ngModelChange)` matches every other field in the component.

### Scope Guards (all enforced — PASS)

- `git diff --name-only`: only the 6 source files + changes.md. NO backend, /api/me, admin, migrations, B2 audio (mic-energy/watchdog/sweep), SFU/transport, or unrelated layout.
- Single source of truth: `grep -rn "'meet-poc.diagnosticsLogging'" frontend/src` ⇒ exactly ONE definition (diagnostics-prefs.ts:15). The only other match is the spec's sanity assertion (`assert KEY === literal`), which is not a second definition — acceptable.
- Reader contract: byte-for-byte equivalent to the removed reader. Verified.
- Lifecycle deferral OFF: `grep TODO/FIXME` over new+changed files ⇒ none. Old private reader+const removed, not commented.

### Required Changes

None.

### Concerns

- **Cross-tab/navigation freshness (already flagged in changes.md Caveats):** the room signal is seeded at construction from localStorage and only re-reads on (re)mount. If a future flow keeps the in-call page mounted while Settings is edited in the same tab, the live gate would not pick up the change until remount. R4 says "Persisted" (localStorage satisfies), and Settings/call are separate routes today, so this is not a B3a defect — noted as adjacent. Worth a line in the S-16 manual note when executed.
- **S-16 is genuinely manual:** the live POST start/stop proof cannot run headless. The deterministic substitute (S-1..S-8 unit spec + S-9..S-15 structural greps, all verified passing) is sufficient evidence for approval per the brief. Recommend independent validation execute the NS5 localhost steps before final sign-off, but that does not gate this batch.

STATUS: DONE (APPROVE)

---

## B3b (R5) — Global/admin diagnostics kill-switch

**Reviewer:** [reviewer] v2.0 · **Date:** 2026-05-30
**Scope reviewed:** `git diff 477d9a4..HEAD` (the two B3b commits only — `5b45c88` backend + `2c36c86` frontend). B3a @ `477d9a4` already passed; not re-reviewed. HEAD confirmed `2c36c86`.

### Verdict

**✅ APPROVE.** Every diff line traces to the locked design and a brief field. Both named specs pass (backend 10/10, frontend truth table exit 0) and are substantive, not hollow. All scope guards hold (NS8, no live push, B3a not regressed, migration idempotent, deferral OFF). The modified `auth-me-logout.test.ts` is a legitimate field-addition, not a regression mask. The 6 full-suite failures are provably not B3b-caused.

### Diff → design anchoring (each change traced)

| Locked-design item | Diff evidence | Verdict |
|---|---|---|
| NEW idempotent migration, no seed row | `0012_app_settings.sql` = `CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`, 5 lines, no INSERT. Matches `0011` format. Runner is glob+sort (`db.ts:45-46`) ⇒ auto-discovered; A-1 idempotency guarded by `_migrations` ledger + IF NOT EXISTS. | ✅ |
| NEW shared store, fail-open, UPSERT | `app-settings/store.ts`: `getDiagnosticsGloballyEnabled` try/catch ⇒ `true` on error, `!row ⇒ true`, `value !== '0'`. `setDiagnosticsGloballyEnabled` `INSERT ... ON CONFLICT(key) DO UPDATE` + `Date.now()`. Single source. | ✅ |
| Admin GET+PUT under existing `requireAdmin`, diagnostics-only | `admin/index.ts:74,78` use `admin` = `requireAdmin(database)` (`:23`) — the SAME wrapper as `/admin/users` (`:26,47`). No new middleware; routes scoped to the one flag, no KV editor. | ✅ NS8 |
| POST gate placement | `sessions/index.ts:160`: `if (!getDiagnosticsGloballyEnabled(database)) return res.json({ ok: true, persisted: false });` sits AFTER the `!admitted ⇒ 403` (`:159`) and BEFORE `appendDiagnosticsEntry` (`:161`). OFF ⇒ no row; ON path unchanged. | ✅ |
| `/api/me` top-level field on BOTH paths | `auth/index.ts:64-68`: guest `{ user: null, diagnosticsGloballyEnabled: ... }`; signed-in adds top-level (not nested) `diagnosticsGloballyEnabled`. | ✅ |
| Pure `computeEffectiveDiagnosticsEnabled` added; B3a exports untouched | `diagnostics-prefs.ts` diff is a PURE addition (0 removed/changed lines) — `return userEnabled && globalEnabled`. | ✅ |
| auth.service signal + MeResponse field + `?? true` | `auth.service.ts`: `MeResponse.diagnosticsGloballyEnabled?`, `signal(true)`, `checkSession` sets `res.diagnosticsGloballyEnabled ?? true` BEFORE the user branch (both guest + signed-in); `.catch` leaves default `true`. | ✅ |
| room.page effective AND-gate at 3 sites | `effectiveDiagnosticsEnabled = computed(...)`; all three gates (start `:2560`, queue `:2737`, flush `:2754`) now `!this.effectiveDiagnosticsEnabled()`. grep: `effectiveDiagnosticsEnabled()` = 3, `!this.diagnosticsLoggingEnabled()` = 0. Payload-builder still records the user pref (`:507`) — left as-is per brief. | ✅ |
| admin.service get/set (URL only here) + single labeled toggle + adminGuard reuse | `admin.service.ts` get/set vs `/api/admin/settings/diagnostics`; `admin.page.ts` delegates (no inline HTTP), `admin.page.html` single labeled "Diagnostics logging" `toggle-row` panel; route reuses `adminGuard` (`app.routes.ts:27`). | ✅ B-4 |

### Scope guards

- **NS8 — no new auth/RBAC:** `middleware.ts` untouched in the diff. New routes use the identical `requireAdmin` wrapper as `/admin/users`. ✅
- **No live push (C-2):** `grep -rn "diagnosticsGloballyEnabled|diagnostics_globally|killswitch" backend/src/modules/signaling/` ⇒ 0 matches. Store consumers = app-settings/auth/admin/sessions only (NOT signaling). ✅
- **B3a not regressed:** `diagnostics-prefs.ts` user read/write/key contract unchanged (pure addition). ✅
- **Migration idempotent, no seed row.** ✅
- **Deferral OFF:** no TODO/FIXME/dead code/commented-out blocks in the source diff (only doc-comments; the one "TODO/FIXME" grep hit is changes.md prose asserting their absence). ✅

### Special scrutiny

1. **Modified `auth-me-logout.test.ts` — LEGITIMATE, not a mask.** S1.3 changed from exact-body `expect(200,{user:null})` / `{user:{email}}` (which MUST now fail given the new top-level field + pre-existing `displayName`/`isAdmin` drift) to field-level checks that additionally assert the new `diagnosticsGloballyEnabled === true` on BOTH guest and signed-in paths — a STRONGER assertion. S1.4 logout similarly relaxed exact-body to `me.body.user === null`. The change adapts to a real contract addition and does not weaken coverage of any B3b behavior. ✅
2. **6 full-suite failures NOT B3b-caused — confirmed the cheap way.** B3b's source diff touches only admin / app-settings / auth(/me) / sessions(diagnostics POST) backend and admin.page / room.page / admin.service / auth.service / diagnostics-prefs frontend. `git diff --name-only` ⇒ ZERO matches for login / rooms / sessions-ttl / migrate-from-json source. Those failing tests assert response shapes on endpoints B3b never edits, so the failures cannot be introduced by B3b. Signaling tests are unmodified and flake under parallel WS-timeout load (pre-existing). Did not run the flaky suite. ✅
3. **Named specs run + non-hollow:**
   - `backend npx vitest run tests/admin-diagnostics-killswitch.test.ts` ⇒ **10 passed, exit 0.** A-6 (`:206`) `expect(res.body).toEqual({ ok: true, persisted: false })` (no `entry`) + (`:208`) row-count-unchanged. A-7 (`:232-234`) non-admitted (`never-admitted`/`bad-key`) ⇒ `.expect(403)` with global OFF ⇒ admit-precedes-global proven. A-8 asserts the field on guest (`:248,253`), signed-in (`:266,271`), and fail-open patched-store (`:285`) paths.
   - `frontend npx tsx src/app/services/diagnostics-global-flag.spec.ts` ⇒ **`diagnostics-global-flag: all assertions passed`, exit 0.** Imports the REAL `computeEffectiveDiagnosticsEnabled` from `./diagnostics-prefs.js` (not a reimplementation); full 4-row truth table.

### changes.md

All Codex sections present in the B3b section: User Report (verbatim R5 + NS8 + JROM), Root Cause (feature what+where, with the DB-vs-env decision ref), Code Changes (per-file WHAT+WHY for all 11 files), Commits, Standing Rules, Verification (command table + grep evidence + smoke walk), Caveats (C-1/C-2 NS5 + pre-existing-failure inventory). Root Cause as a feature what+where statement is acceptable for a feature batch. ✅

### Manual / NS5 (non-blocking, no screenshot required)

- **C-1** (admin UI toggle end-to-end on localhost:4700) and the live-call portions of C-2 are MANUAL NS5 — deterministic substitutes (A-5/A-6/A-8 backend + B-1 truth table + structural greps) carry the proof. Recommend independent validation execute the C-1 localhost steps before final sign-off; does not gate this batch.
- **C-2 mid-session window** is documented INTENDED behavior (backend gate authoritative; client stops on next room entry; no WS/SSE push, confirmed by the 0-match signaling grep). Acceptable per JROM's intent ("when we are at a certain point we can just off these" — applies to new data persistence, not live call interruption).

### Required Changes

None.

### Concerns (non-blocking)

- **Mid-session client window** (C-2): a client already in-call keeps POSTing until its next `/api/me` (next room entry). Backend is the authoritative immediate kill (no row persisted), so no diagnostics data leaks while the flag is OFF — only redundant 200-no-op requests. Intentional per NS8; documented. Not a defect.
- PUT coercion (`enabled === true || 'true' || 1`) is tolerant; the admin UI only ever sends a boolean, and A-3/A-4 cover the boolean path. Acceptable.

STATUS: DONE (APPROVE)
