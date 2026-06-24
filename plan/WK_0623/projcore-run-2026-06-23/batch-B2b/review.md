# Batch B2b — Review

## Locks satisfied

1. **protected only** — list adds `protected: true`; no `isSuperuser` in list JSON. Superuser row greyed, **Protected** label, zero action buttons for all viewers.
2. **God-mode gating** — `isSuperuser` from `/api/me` drives god-mode button group; non-super admins see create + delete + toggle-admin only.
3. **Confirm** — styled in-page confirm modal before delete and every god-mode mutation (after `window.prompt` for inputs).
4. **B2a wiring** — five admin service methods map to B2a endpoints; email path uses `encodeURIComponent`.

## Risks / notes

- Superuser cannot act on own protected row per lock (1) — self-edits remain in account settings / direct API.
- God-mode **Role** reuses `PATCH .../role` (requireAdmin); superuser is admin so this is valid.
- `window.prompt` retained for input collection (density-light); confirm is DOM-capturable for UI-PROOF.

## Verdict

PASS — ready for independent validation.