# B3 Gate Validation Report — Recording Upload Failure Observability
**Validator:** Independent VALIDATOR (verifier ≠ fixer, sonnet)
**Date:** 2026-06-25 04:20 PHT (UTC+8)

---

## Check 1 — Each Rejection Path Logs a Warn with Reason

`backend/src/modules/recording/index.ts` lines 60–63 define:

```typescript
function warnRecordingUploadRejected(reason: string, roomId: string, email: string, detail?: string): void {
  const suffix = detail ? ` detail=${detail}` : '';
  console.warn(`[rec] rejected ${reason} room=${roomId || '<missing>'} user=${email}${suffix}`);
}
```

All four `/upload` rejection branches call this helper before returning:

| Branch | Line | Call |
|--------|------|------|
| `room-not-found` | 85 | `warnRecordingUploadRejected('room-not-found', roomId, authReq.user.email)` → 404 |
| `owner-mismatch` | 89 | `warnRecordingUploadRejected('owner-mismatch', room.id, authReq.user.email, 'owner=<ownerEmail>')` → 403 |
| `no-open-or-recent-session` | 94 | `warnRecordingUploadRejected('no-open-or-recent-session', room.id, authReq.user.email)` → 409 |
| `write-error` | 111 | `warnRecordingUploadRejected('write-error', room.id, authReq.user.email, String(err))` → 500 |

**Result: ✅ PASS — all 4 rejection paths emit `console.warn('[rec] rejected <reason> room=… user=…')`**

---

## Check 2 — Owner-403 Gate Logic Unchanged

`recording/index.ts` lines 88–91 (unchanged guard):

```typescript
if (room.ownerEmail !== authReq.user.email) {
  warnRecordingUploadRejected('owner-mismatch', room.id, authReq.user.email, `owner=${room.ownerEmail}`);
  return res.status(403).json({ error: 'forbidden' });
}
```

The gate is the same `room.ownerEmail !== authReq.user.email` comparison returning 403. Only a single `warnRecordingUploadRejected` call was inserted between the guard check and the existing `return res.status(403)`. Response body, status code, and gate order are unmodified.

**Result: ✅ PASS — gate logic unchanged; only logging added**

---

## Check 3 — Host 'Couldn't Save' Notice Fires on Failed Upload

Chain in `frontend/src/app/pages/room/room.page.ts`:

1. **`RecorderService.upload()` throws on non-2xx** (line 257):
   ```typescript
   if (!res.ok) throw new Error(`upload failed ${res.status}`);
   ```
   A 403 or 409 from `/upload` causes the upload promise to reject.

2. **`flushRecordingForExit()` catches via `Promise.allSettled`** (lines 1609–1630):
   ```typescript
   const [mainResult] = await Promise.allSettled([
     withTimeout(this.recorder.upload(blob, this.roomId), 300_000, null),
     …
   ]);
   return true; // upload failed or timed out
   ```
   A rejected upload → `allSettled` result status `'rejected'` → function returns `true` (= upload failed).

3. **`justLeave()` and `endForAll()` call `recordCallIssue` on failure** (lines 1574–1576, 1587–1595):
   ```typescript
   const uploadFailed = await this.flushRecordingForExit();
   if (uploadFailed)
     this.recordCallIssue('Recording could not be saved — upload failed or timed out.');
   ```

4. **`recordCallIssue()` (line 3833) appends to `callIssues`**, which `LeaveDialogComponent` renders in the dialog body — not a transient status line.

The path is complete: failed upload → throw → allSettled catches → `flushRecordingForExit` returns `true` → `recordCallIssue` → host sees dialog warning.

**Result: ✅ PASS — host notice fires on failed/timed-out upload via leave-dialog `callIssues`**

---

## Check 4 — Backend Tests Assert Log + Status Outcomes

Two existing tests were updated with `console.warn` spies:

### `S2.2 upload rejects an authenticated non-owner`
```typescript
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
// … POST /upload as non-owner …
.expect(403, { error: 'forbidden' });
expect(warn).toHaveBeenCalledWith(
  expect.stringContaining('[rec] rejected owner-mismatch room=abc123abc123 user=other@silverjrom.app')
);
```
- Asserts: HTTP 403 **AND** warn logged with `owner-mismatch` + correct room/user ✅

### `S2.3 upload rejects an owner when no meeting session is open`
```typescript
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
// … POST /upload as owner with no session …
.expect(409, { error: 'no open meeting session' });
expect(fs.readdirSync(dir)).toEqual([]);
expect(warn).toHaveBeenCalledWith(
  expect.stringContaining('[rec] rejected no-open-or-recent-session room=abc123abc123 user=jrom@silverjrom.app')
);
```
- Asserts: HTTP 409 **AND** no files written **AND** warn logged with `no-open-or-recent-session` ✅

Test run output confirms the warn actually fires (seen on stderr for the non-spied B2 wrong-owner test, silenced but captured for S2.2/S2.3 by the mock):
```
stderr | … B2 keeps wrong-owner upload rejected …
[rec] rejected owner-mismatch room=abc123abc123 user=other@silverjrom.app detail=owner=jrom@silverjrom.app
stdout | … S2.3 …
[rec] rejected no-open-or-recent-session room=abc123abc123 user=jrom@silverjrom.app
```

Run result: **34 tests passed (0 failed)** in 7.95s.

**Result: ✅ PASS — tests assert both status code and warn log content; all green**

---

## Check 5 — B3-changes.md Presence

`validation/B3-changes.md` exists at `/home/agjrom/websites/meet-poc/validation/B3-changes.md`. It lists:
- Files touched: `callbacks/B3.md`, `backend/src/modules/recording/index.ts`, `backend/tests/recording.test.ts`
- Log lines and their format
- Host-notice path description
- Test PASS output (34/34)

**Result: ✅ PRESENT — no artifact gap**

---

## Summary

| Check | Result |
|-------|--------|
| 1. All rejection paths log warn with reason | ✅ PASS |
| 2. Owner-403 gate logic unchanged | ✅ PASS |
| 3. Host notice fires on failed upload | ✅ PASS |
| 4. Tests assert log + status outcomes, green | ✅ PASS (34/34) |
| 5. B3-changes.md present | ✅ PRESENT |

---

STATUS: VALIDATED
