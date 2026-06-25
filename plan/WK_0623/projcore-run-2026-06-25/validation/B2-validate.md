# B2 Gate Validation Report — Grace-window + Persist
**Validator:** Independent VALIDATOR (verifier ≠ fixer, sonnet)
**Date:** 2026-06-25 04:05 PHT (UTC+8)

---

## Check 1 — Diff Scope

`B2-changes.md` (found at `validation/B2-changes.md`) declares the touched files as:
- `backend/src/modules/sessions/store.ts` — `getRecentSessionFor` added
- `backend/src/modules/recording/index.ts` — upload lookup switched + named constant
- `backend/tests/recording.test.ts` — B2 coverage added
- `frontend/src/app/services/recording-pending.ts` — new service (scan/clear/reconcile)
- `frontend/src/app/services/recording-pending.spec.ts` — coverage
- `frontend/src/app/pages/rooms/rooms.page.ts` — reconciles on load
- `frontend/src/app/pages/recordings/recordings.page.ts` — reconciles on load

All touches are within the expected scope (backend recording/session + client reconciliation + tests). The changes landed inside a larger combined commit (`1fbc273`) together with other validated batches — the scope declared in `B2-changes.md` is correct.

**Result: ✅ PASS**

---

## Check 2 — Owner-Gate Intact (CRITICAL)

`backend/src/modules/recording/index.ts` line 80:
```typescript
if (room.ownerEmail !== authReq.user.email) return res.status(403).json({ error: 'forbidden' });
```

This check runs **before** the session lookup on line 81. It was not weakened or relaxed — the new `getRecentSessionFor` call on line 81 is only reached if the caller is already confirmed as the room owner.

**Result: ✅ PASS — gate is intact and runs before session lookup**

---

## Check 3 — Grace-Window Correct (Not Always-Accept)

Named constant in `recording/index.ts`:
```typescript
const RECORDING_UPLOAD_SESSION_GRACE_MS = 5 * 60 * 1000;
```

`getRecentSessionFor` in `sessions/store.ts` lines 166–189:
```sql
WHERE room_id = ?
  AND host_email = ?
  AND (ended_at IS NULL OR ended_at >= ?)
ORDER BY
  CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END DESC,
  COALESCE(ended_at, started_at) DESC
LIMIT 1
```
where `? = Date.now() - graceMs` (i.e. `Date.now() - 300000`).

- Open sessions (`ended_at IS NULL`): accepted ✅
- Sessions ended ≤ 5 min ago (`ended_at >= cutoff`): accepted ✅
- Sessions ended > 5 min ago (`ended_at < cutoff`): excluded by the `AND` clause ✅
- ORDER BY prefers open sessions over recently-ended ✅
- "Always accept" is NOT possible — the cutoff is a real time-bound passed as a SQL parameter ✅

**Result: ✅ PASS — time bound is real, not always-accept**

---

## Check 4 — Reproduce-First Evidence

`validation/B2-changes.md` is present and includes:
> Before backend fix, `npm test -w backend -- tests/recording.test.ts` failed the new B2 test with `expected 200 "OK", got 409 "Conflict"` for a session ended 10 seconds earlier.
> After fix, that same recent-ended case is accepted and saved with the original session id in the filename.

The artifact exists and documents the 409→accept flip. ✅

**Result: ✅ PASS — reproduce-first evidence documented**

---

## Check 5 — Tests Green + Valid Outcomes

Command run:
```
npm test -w backend -- tests/recording.test.ts --testTimeout 10000
```

Result: **34 tests passed (0 failed)** in 8.95s.

The three B2-specific tests audit **outcomes**, not just call-invocation:

### `B2 accepts an owner upload for a session ended within the recording grace window`
- Setup: session ended `Date.now() - 10_000` ms ago (10s, within 5-min grace)
- Assert: HTTP 200, `res.body.file` contains `_${session.id}_abc123abc123_`, file content is correct bytes
- **Outcome: acceptance + correct session ID embedded in filename** ✅

### `B2 rejects an owner upload for a session ended outside the recording grace window`
- Setup: session ended `Date.now() - 301_000` ms ago (301s > 5-min grace)
- Assert: HTTP 409 `{ error: 'no open meeting session' }` AND `fs.readdirSync(dir)` is empty
- **Outcome: rejection + no file written** ✅

### `B2 keeps wrong-owner upload rejected even inside the recording grace window`
- Setup: session ended 10s ago (within grace), but authenticated as `other@silverjrom.app`
- Assert: HTTP 403 `{ error: 'forbidden' }`
- **Outcome: security gate holds even under grace window** ✅

**Result: ✅ PASS — tests green, assert outcomes, security boundary verified under grace window**

---

## Check 6 — Client Persist/Confirm Reconciliation

`frontend/src/app/services/recording-pending.ts`:

- **`pendingRecordingSessionIds(storage)`**: scans `localStorage` for all keys matching `recording-pending-<sessionId>`, returns the session IDs.
- **`clearPendingRecordingMarker(sessionId, storage)`**: removes `recording-pending-<sessionId>` from localStorage.
- **`reconcilePendingRecordings(recordingsService, storage)`**: for each pending sessionId, calls `recordingsService.list({ page: 1, pageSize: 1, sessionId })` — confirms if `result.total > 0` or any returned recording's `sessionId` matches. If confirmed: clears the marker + pushes to `confirmedSessionIds`. If failed or network error: keeps in `pendingSessionIds` (error catch path).

**Interrupted-close coverage**: if the upload races with close-room and the recording wasn't saved yet, the marker stays in `pendingSessionIds` (not cleared) until a subsequent reconcile confirms it. This covers the race correctly — dismiss no longer deletes unconfirmed markers per `B2-changes.md`. ✅

**Result: ✅ PASS — reconciliation path exists and covers the interrupted-close case**

---

## Summary

| Check | Result |
|-------|--------|
| 1. Diff scope | ✅ PASS |
| 2. Owner-gate intact (CRITICAL) | ✅ PASS |
| 3. Grace-window real (not always-accept) | ✅ PASS |
| 4. B2-changes.md with reproduce-first | ✅ PASS |
| 5. Tests green + valid outcomes | ✅ PASS (34/34) |
| 6. Client persist/reconcile | ✅ PASS |

---

VERDICT: PASS
