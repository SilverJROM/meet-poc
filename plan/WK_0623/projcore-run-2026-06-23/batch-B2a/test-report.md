# Batch B2a — Test Report

**Date:** 2026-06-23  
**Branch:** feat/recording-reliability-b5 (uncommitted)

## Commands

```bash
cd backend && npm run build          # tsc — PASS
cd backend && npm test               # vitest — PASS
cd backend && npm test -- tests/admin-superuser.test.ts  # PASS (10/10)
```

## Results

| Suite | Result |
|---|---|
| `admin-superuser.test.ts` | 10 passed |
| Full backend | 185 passed, 1 skipped (31 files) |
| Typecheck (`tsc`) | clean |

## Requirement coverage

| Req | Test |
|---|---|
| R2.1 | migration seeds column + single superuser row |
| R2.2 | admin delete/toggle on normal user |
| R2.3 | superuser edit username/email/role/reset |
| R2.4 | admin god-mode endpoints → 403 |
| R2.5 | isSuperuser on /me only; absent from list |
| R2.6 | admin actions on superuser target → 403 |
| R2.8 | self email OK; self role demote → 403 |

## Red-team B2a addendum

| Probe | Result |
|---|---|
| Mixed-case / space-padded superuser email target | PASS — admin delete/role attempts still 403; `COLLATE NOCASE` lookup matches the seeded row after route-param trim |
| Create payload superuser escalation | PASS — `isSuperuser` / `is_superuser` request fields ignored; inserted row has `is_superuser=0`; case-clone of `silverjrom@gmail.com` returns 409 |
| Superuser self email cascade | PASS — `/api/account/email` carries `is_superuser=1` and `is_admin=1` to the new user row and keeps the existing session superuser-aware |
| Mutating admin endpoint guard coverage | PASS — user-mutating admin routes audited; delete/role have target guard, god-mode edit/email/reset require superuser plus guard, create cannot set `is_superuser` |
| `is_superuser` exposure | PASS — public/admin responses checked: login and `/admin/users` do not expose it; own `/api/me` exposes `isSuperuser` only |
