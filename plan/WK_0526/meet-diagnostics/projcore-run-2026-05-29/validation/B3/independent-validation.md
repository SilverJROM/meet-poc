# B3 Independent Validation (Rule 11 — fresh-context Opus, verifier ≠ fixer)

> Append-only. Each sub-batch gets its own section. The validator received ONLY the requirement + changes.md + the localhost URL — no scenarios, no review, no plan.

---

## B3a (R4) — User-level diagnostics on/off toggle — STATUS: PASS

**Validated:** commit `477d9a4` on `feat/meet-diagnostics-audio-20260529` (parent `2c062ff`).
**Requirement:** R4 — "A visible toggle in Settings (default ON). When OFF, that client stops collecting AND uploading diagnostics. Persisted."

**Independent findings (all confirmed against the real diff/code, not changes.md's word):**
1. **Visible labeled toggle, default ON (seeded, not hardcoded)** — `account-settings.component.html` renders a "Diagnostics" `account-field` with a labeled checkbox in the Account-tab `account-card`. Initial state seeded at `account-settings.component.ts:52` via `signal(readDiagnosticsLoggingEnabled())`; absent-key ⇒ true ⇒ renders checked. Not hardcoded `true`.
2. **Persists + correct read contract** — `diagnostics-prefs.ts` writes `setItem(KEY, enabled ? '1' : '0')` (:37) and reads `getItem(KEY) !== '0'` (:23). Contract: absent⇒true, `'0'`⇒false, other⇒true, throw⇒true. Toggle writes the SAME key the gates read. Durable across reload (localStorage).
3. **OFF stops BOTH collecting AND uploading** — same persisted value seeds `room.page.ts:225` signal; three gates short-circuit on `this.diagnosticsLoggingEnabled()`: `startDiagnosticsLogger` (:2555, no sampling timer), `queueDiagnosticsLog` (:2732, no queueing), `flushDiagnosticsLog` (:2749, early-returns BEFORE `collectDiagnostics()` :2750 AND before `sendDiagnosticsBeacon`/`appendDiagnostics` :2752/:2756). Not label-only.
4. **Deterministic proof genuine** — `npx tsx src/app/services/diagnostics-prefs.spec.ts` ⇒ `all assertions passed`, exit 0. Spec dynamically imports the REAL module after a localStorage shim and exercises the real exports (S-1..S-8 + writer error-safety). Not hollow.
5. **Scope clean, no dead duplicate** — frontend-only diff; old private key const + private reader DELETED from `room.page.ts`; grep confirms the key literal + both functions live ONLY in `diagnostics-prefs.ts`.

**Adversarial checks cleared:** no write-key/read-key mismatch; default ON not OFF; gate covers collection AND upload (flush returns before both collect and append/beacon); unit test calls the real code.

**Manual-pending (NS5, non-blocking):** S-16 live two-party call POST start/stop — not driveable headless; needs JROM USER-seat localhost:4700 confirmation.

STATUS: PASS

---

## B3b (R5) — Global/admin diagnostics kill-switch — STATUS: PASS

**Validated:** commits `5b45c88` (backend) + `2c36c86` (frontend) on `feat/meet-diagnostics-audio-20260529` (on top of B3a `477d9a4`).
**Requirement:** R5 — "A master switch (admin/global) ... When OFF: backend stops accepting/persisting diagnostics AND clients learn to stop collecting (via the existing config/me surface). Reuses existing admin auth — NO new auth/RBAC boundary." NS8 + precedence (global OFF beats user ON).

**Independent findings (fresh Opus, adversarial — verified against the real diff/code + ran the specs):**
1. **Server-authoritative OFF stops persistence** — `sessions/index.ts:159` `if (!getDiagnosticsGloballyEnabled(database)) return res.json({ok:true,persisted:false})` sits AFTER the `if (!admitted) return 403` (:158) and BEFORE the single `appendDiagnosticsEntry` (:161). Admit-before-global ordering correct; no DB insert when OFF; flag read live from DB per request (runtime-flippable, no redeploy). Only one POST handler — no bypass path.
2. **Default ON + fail-open** — `app-settings/store.ts:27-37`: absent⇒true, `'0'`⇒false, else⇒true, try/catch⇒true on any error. Migration seeds no row.
3. **Clients learn + precedence** — `/api/me` carries top-level `diagnosticsGloballyEnabled` on BOTH guest `{user:null,...}` and signed-in paths (`auth/index.ts:64-68`); `auth.service.ts:44` sets the signal `?? true` before the branch (catch leaves default true). `room.page.ts:227-229` `effectiveDiagnosticsEnabled = computed(() => userToggle && globalFlag)` wires into ALL THREE gates (start/queue/flush); 0 remaining bare user-only guards. Global OFF beats user ON. (call-end beacon reachable only via the gated `flushDiagnosticsLog`.)
4. **No new auth/RBAC boundary (NS8)** — `git diff 477d9a4..HEAD -- backend/src/modules/auth/middleware.ts` EMPTY; new admin routes (`admin/index.ts:74,78`) reuse the same `requireAdmin(database)` wrapper as `/admin/users`. No hand-rolled auth.
5. **Proofs real + strong** — backend `admin-diagnostics-killswitch.test.ts` 10/10: A-6 asserts response shape AND genuine DB row-count unchanged; A-7 admit-before-global 403; A-4 requireAdmin 401/403/200; A-8a-e /me both paths + fail-open. Frontend `diagnostics-global-flag.spec.ts` exercises the REAL `computeEffectiveDiagnosticsEnabled` incl. (true,false)⇒false.
6. **Migration idempotent** — `0012_app_settings.sql` CREATE TABLE IF NOT EXISTS, no seed; auto-discovered by the runner (`db.ts:45-46`).

**Adversarial attempts (all FAILED to break it):** bypass path, wrong gate order, cached flag, missing guest /me field, a gate keeping the user-only check, default-OFF/fail-closed, slipped-in new auth boundary — none present.

**Manual-pending (NS5, non-blocking):** C-1 live two-party call POST start/stop while admin-flipping + mid-session-flip window — not driveable headless; needs JROM USER-seat localhost:4700 confirmation. Mid-session flip = backend-gate-authoritative by design (no live push, intentional per C-2).

STATUS: PASS

