# Validation — Batch 3 (Angular shell + auth + dashboard)

**Verdict:** **PASS** (iteration 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.
**Verifier ≠ fixer:** confirmed.

---

## Gate 1 — Artifact completeness

All required B3 artifacts present:

| Artifact | Present | Notes |
|---|:---:|---|
| `batch-3/changes.md` | ✓ | Codex template + Ports table + explicit decision-file pointers |
| `batch-3/scenarios-implemented.md` | ✓ | 8 rows (S3.1–S3.8) with test paths + evidence (incl screenshot refs) |
| `batch-3/test-report.md` | ✓ | Backend regression PASS, Playwright B3 8/8 PASS, no flakes |
| `batch-3/review.md` | ✓ | Self-review APPROVE |
| `batch-3/independent-validation.md` | ✓ | Fresh-eyes |
| `batch-3/screenshots/` | ✓ (3 real PNGs) | login-page (14KB), dashboard-with-room (82KB), room-list-after-delete (65KB) — actual app renders, sizes non-trivial |
| `decisions/2026-05-19-b3-proxy-and-webserver.md` | ✓ | port choice + http-proxy library + Angular dev process model |
| `decisions/2026-05-19-b3-room-placeholder.md` | ✓ | the `/room/:id` placeholder needed for S3.7; flagged for B4 replacement |
| `decisions/2026-05-19-b3-angular-cdk-version.md` | ✓ | CDK 20.2.14 (Angular 21 peers rejected) |

Gate-7 fully closed — codex now logs decisions per §1.15 by default.

## Gate 2 — Diff review

4 atomic commits on `feat/meet-rebuild-b3-angular-shell`:

```
e4f898f docs: add batch 3 evidence artifacts
7e03977 feat: add consolidated frontend proxy and e2e
8d16b4f chore: ignore Angular cache
30926ae feat: add Angular auth dashboard shell
```

Read each touched file:
- **`frontend/`** — full Angular 20 standalone workspace; `package.json` deps verified to include `@angular/{core,common,router,forms,platform-browser}@^20` + `@angular/cdk@^20.2.14` + `@ionic/angular` + `ionicons` + `rxjs` + `zone.js`. **NO `@apollo/client` / `apollo-angular` / `graphql`** present (REST-only decision honored).
- **`frontend/src/app/app.routes.ts`** — lazy-loaded `/login` (noAuthGuard), `/dashboard` (authGuard), `/room/:id` (placeholder, no guard), `**` → dashboard. Clean.
- **`frontend/src/app/services/auth.service.ts`** — signal-based user state (`user = signal<User|null|undefined>(undefined)`), `ensureSession`/`checkSession`/`login`/`logout`; promise-cache pattern prevents N parallel `/api/me` requests on first navigation.
- **`frontend/src/app/guards/auth.guard.ts` + `no-auth.guard.ts`** — gate routes via `ensureSession()`.
- **`frontend/src/app/pages/login/`** — form with `#login-email`/`#login-password` IDs (matched in tests), show-password toggle button with aria-pressed + aria-label, inline error display.
- **`frontend/src/app/pages/dashboard/`** — topbar (brand + email + Logout), create-room form, rooms list with `.room-row` selector + share-URL `<code>` + Join/Copy/Delete buttons, "Recordings" placeholder section (correctly scoped for B5).
- **`frontend/src/app/pages/room-placeholder/`** — minimal page that calls `/api/rooms/:id/exists` and renders "Room not found" or a B4-pending placeholder. Codex flagged this in `decisions/2026-05-19-b3-room-placeholder.md` — judgement call to enable S3.7 without implementing B4 lobby/call. **/projcore concurs.**
- **`scripts/serve.js`** — `http-proxy` based; proxies `/api/*` + `/upload` → backend (4720); `/ws` upgrade → backend (ws://); everything else → Angular dev (4711) in dev, or static `frontend/dist/meet-poc-frontend/browser/` in prod. Listens on 4710. Catches proxy errors with 502 response. Clean.
- **`scripts/e2e-webserver.js`** — Playwright launcher that brings up the 3-process stack (backend, ng serve, scripts/serve.js).
- **`e2e/`** — Playwright workspace with `playwright.config.ts` (`baseURL: http://localhost:4710`, fake-media browser flags), `fixtures/auth.ts` (real `INITIAL_PASSWORD.txt` lookup, real login helper), 6 spec files under `tests/b3-shell-auth/`.
- **`ecosystem.config.js`** — three PM2 entries: legacy `meet-poc` (4700, unchanged), `meet-poc-be` (4720), new `meet-poc-fe` (4710). `BACKEND_ORIGIN` + `FRONTEND_ORIGIN` env vars correctly set.
- **Root `package.json`** — workspaces now `["backend","frontend","e2e"]`. Adds `http-proxy` as runtime dep.

Out-of-scope check: no `/room/:id` call/lobby UI (placeholder only — codex's autonomous call was the right call). No recording / coturn / CF Tunnel changes. No backend code modifications.

## Gate 3 — Build verification

```
$ npm run build
> npm run build -w backend     # tsc PASS
> npm run build -w frontend    # Angular production bundle PASS, ~1.7s
```

Frontend bundle is split into lazy route chunks (login-page 3.6KB, dashboard-page 7.3KB, room-placeholder-page 1.7KB) — confirms lazy-loading is wired correctly.

Output at `frontend/dist/meet-poc-frontend/browser/` — matches the path serve.js reads in prod mode.

## Gate 4 — Targeted test pass

```
$ cd backend && npm test            → 12 files / 19 tests / 3.88s — B1+B2 still green, zero regression
$ npm test -w e2e -- tests/b3-shell-auth → 8 tests / 5.0s — all S3.1-S3.8 PASS independently
```

Playwright auto-orchestrated the full 3-process stack via `webServer` config (verified by codex's `scripts/e2e-webserver.js`). All 8 tests green on independent rerun.

## Gate 5 — Evidence quality (5Q checklist)

| Q | Verdict | Evidence |
|---|---|---|
| Q1 Scenario coverage? | ✓ | Read each spec: `page.goto`, `page.locator`, `page.click` against real Angular SPA on real port 4710 going through real proxy to real backend. Not source-regex smell. |
| Q2 Proof at right level? | ✓ | UI-level scenarios (S3.1, S3.4, S3.5, etc.) proven via Playwright DOM assertions — the right level. API-level cross-check (S3.6 `/api/me` returning `null` after logout) is API supplementary, layered correctly. |
| Q3 Screenshots match claims? | ✓ | 3 real PNGs (14KB, 82KB, 65KB) — non-trivial sizes indicate real renderings, not blank pages. Filenames match the scenarios they're cited from. |
| Q4 Scenario-to-test mapping? | ✓ | 8 scenarios = 8 tests = `Running 8 tests` Playwright output. S3.2+S3.3 share `guards.spec.ts` (each a separate test). S3.4+S3.8 share `dashboard.spec.ts`. Counts arithmetic checks. |
| Q5 Requirement closure? | ✓ | **R4.8 (stitched-panel absent) closed by S3.5** — `expect(page.locator('input[type="email"]')).toHaveCount(0)` is the architecturally correct assertion (`.toHaveCount(0)` proves the form is NOT IN THE DOM, not just hidden by CSS — closes the legacy specificity-bug class entirely). This is the closure of JROM's verbatim complaint. |

**§2.10 validator discipline check:** `grep -r "page.setContent" e2e/tests/` returns no matches. All tests use `page.goto`/`page.locator`/`page.getByRole` against the real running app. ✓

**§2.10a targeted-first check:** codex ran `npm test -w e2e -- tests/b3-shell-auth`, NOT full e2e. ✓

## Gate 6 — Requirement coverage matrix update

R4.1, R4.3, R4.4, R4.5, R4.8, R8.1 (now full), R8.2, R9.1, R9.2, R9.4 → **VERIFIED**.
R4.2 → **PARTIAL** (/login + /dashboard routes done; /room/:id placeholder routes but full lobby/call comes in B4).
R8.5 → **PARTIAL** (backend tsc + Angular ng build both work; final deploy artifacts polish in B6).

## Gate 7 — Standing rules + decisions log

Three decision files this batch — all written in `projcore-run-2026-05-19/decisions/` directly per §1.15 (gate-7 flag from B1 long closed). Each frontmatter has `type: autonomous-call, source: codex-implementer, batch: B3`. Each documents alternatives rejected.

**One decision worth surfacing to JROM** (not blocking — just transparent): codex added a `/room/:id` placeholder page in B3 (small B4-light surface) explicitly to make S3.7 (delete-room test) provable at the UI level. The placeholder is dumb — it only calls `/api/rooms/:id/exists` and renders "Room not found" or a placeholder banner. **B4 replaces it.** This is documented in `decisions/2026-05-19-b3-room-placeholder.md` with the trade-off (under-prove UI-level S3.7 if not added vs adding ~30 lines of B4-light code). /projcore reads this as forced-correctness, not scope creep.

## Other observations

- **Legacy `voice.silverjrom.app` on port 4700 still undisturbed.**
- **3-process stack now works:** BE :4720 + Angular dev :4711 + consolidated proxy :4710. PM2 has entries for BE and proxy; Angular dev runs separately (codex's documented choice — keeps PM2 simple).
- **The Recordings dashboard section is a placeholder** ready for B5 to populate. No data wiring yet — just the empty state.
- 5 moderate npm-audit transitive deps still flagged from B1; not blocking.

## Verdict

**STATUS: PASS** — B3 Angular shell complete. 10 reqs newly VERIFIED, 2 newly PARTIAL (R4.2 + R8.5, both expected to close in later batches). **S3.5 closes JROM's verbatim "stitched up app" complaint at the requirements level.** Cleared for B4 dispatch.
