# Validation — v2-B3 (Frontend app shell refactor)

**Verdict:** **PASS** (iter 1).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present + 3 decisions logged (`sidebar-persistence-key`, `shell-logout-placement`, `live-playwright-config`). 4 real screenshots.

## Gate 2 — Diff review

5 atomic commits + clean tree. Routes refactored cleanly:
- `/` and `/dashboard` → `/app/rooms` redirect
- `/app` parent with `authGuard` + 6 children
- Dashboard content split: create+rooms-list → `pages/rooms/`, recordings list → `pages/recordings/`
- 4 stub pages added (ongoing-stub, past-stub for B4; transcripts-stub, settings-stub for Run 2)
- Old `pages/dashboard/` deleted
- Internal links migrated: login redirect, no-auth-guard redirect, /room/:id "Back to dashboard" link all point to `/app/rooms`

## Gate 3 — Build

`npm run build` PASS (backend tsc + Angular).

## Gate 4 — Targeted tests

- Backend regression: 16 files / 39 tests green
- B3 Playwright (live config against PM2): 8/8 in 2.2s

## Gate 5 — Evidence quality

- Q1 ✓ Real DOM tests via real PM2 stack
- Q2 ✓ UI-level proof at the right level
- Q3 ✓ 4 real screenshots (collapsed, open, transcripts-stub, settings-stub)
- Q4 ✓ 8 specs × 4 scenarios = mapping consistent
- Q5 ✓ Live smoke against voice.silverjrom.app confirms `/dashboard`, `/app/rooms`, `/app/transcripts` all serve Angular `<app-root>` correctly

### Live smoke against voice.silverjrom.app

```
curl https://voice.silverjrom.app/dashboard → HTTP 200 + Angular HTML
curl https://voice.silverjrom.app/app/rooms → <app-root></app-root>
curl https://voice.silverjrom.app/app/transcripts → <app-root></app-root>
GET /api/rooms → 1 room (TEST_ROOM01) — dashboard hygiene preserved
GET /api/recordings → 0 (smoke artifacts cleaned)
```

Hygiene rule honored: no test pollution.

## Gate 6 — Matrix update

R3.1, R3.2, R3.3, R3.4 → **VERIFIED**.

## Gate 7 — Decisions + project_specs

3 decisions properly logged. `project_specs.md` updated with v2 app shell. Codex's "live-playwright-config" decision documents how they pivoted around the e2e webserver port collision — honest reporting; not gaming.

## Verdict

**PASS** — 4 new VERIFIED. **Matrix: 17/44 VERIFIED, 27 ASSIGNED, 0 PARTIAL, 0 FAIL.** Cleared for B4.
