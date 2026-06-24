# Batch B2b — Independent validation

## Repro commands

```bash
cd frontend && npm run build
cd backend && npm test -- tests/admin-superuser.test.ts
cd e2e && npx playwright test tests/b2b-admin-ui/admin-ui.spec.ts
```

## Expected

| # | Check |
|---|---|
| 1 | Frontend build completes without errors |
| 2 | `GET /api/admin/users` includes `protected: true` for superuser row only; response JSON contains no `isSuperuser` |
| 3 | Admin session: superuser row has class `protected`, shows Admin chip, no action buttons |
| 4 | Superuser session: non-protected rows show god-mode buttons |
| 5 | God-mode username edit shows in-page confirm before API call |
| 6 | Screenshots exist at `batch-B2b/screenshots/admin-protected-row.png` and `god-mode-confirm.png` |

## Evidence

- Playwright spec: `e2e/tests/b2b-admin-ui/admin-ui.spec.ts`
- Screenshots under `plan/WK_0623/projcore-run-2026-06-23/batch-B2b/screenshots/`