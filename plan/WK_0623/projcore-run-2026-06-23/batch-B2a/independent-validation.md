# Batch B2a — Independent Validation Checklist

For validator / coordinator re-run:

1. `cd backend && npm run build` — expect exit 0.
2. `cd backend && npm test -- tests/admin-superuser.test.ts` — expect 7/7 pass.
3. Spot-check `403` assertions in test file — not just "endpoint exists".
4. `grep -r is_superuser backend/src/modules/admin/index.ts` — list mapper must NOT expose it.
5. `curl` smoke (optional): login as seeded superuser → `/api/me` has `isSuperuser:true`; `/api/admin/users` JSON has no `isSuperuser` key.

**Implementer verdict:** PASS — build green, 182 backend tests pass, B2a scenarios covered.