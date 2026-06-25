# B3 — Stop silent save-failures: log rejections + host notice (codex55, IMPLEMENTER)

**Role:** IMPLEMENTER. **Repo:** ~/websites/meet-poc, branch `main`. Atomic, tight diff.

## Requirement (R3)
Today a rejected/failed recording upload is **silent**: `backend/src/modules/recording/index.ts` `/upload` returns 403 (owner mismatch) / 409 (no open/recent session) / 500 (write error) with **no server log** (only success logs `[rec] saved`). And the host isn't reliably told. Make failures observable.

## Tasks
1. **Server-side logging:** in `/upload`, log every non-success path with reason + context (roomId, user email, why) — e.g. `console.warn('[rec] rejected <reason> room=<id> user=<email>')` for the 403 / 409 / 404 / write-error branches. Do NOT change the gate logic (owner 403 stays); just log when it fires.
2. **Host notice:** the client already has a "couldn't save" path (`recordCallIssue` / the T6 leave-dialog notice in `room.page.ts` `flushRecordingForExit`). Confirm it fires on a failed/timed-out upload and surfaces to the host (not a transient status line). If the upload now returns a structured error, make sure the host notice reflects it. Read the current code first; tighten only what's needed so a real failure is visibly surfaced.

## Tests
- Backend: a 403 and a 409 upload attempt each produce the warn log (assert via spy/captured output) and the correct status. (Extend `backend/tests/recording.test.ts`.)
- Keep the owner-gate behavior unchanged (403 still returned).
Run touched-scope tests — green.

## Constraints
Owner-gate logic UNCHANGED. Tight diff, no unrelated refactors, no TODOs (pre-live).

## Deliverable
`validation/B3-changes.md`: files touched, the log lines added, the host-notice path, test output (PASS).

## Callback (MANDATORY)
FIRST action (before prose): append `[callback] B3 codex55 <STATE> <timestamp>` to `callbacks/B3.md`. End reply `STATUS: DONE` or `STATUS: BLOCKED <reason>`.
