# Correction — batch-B5 iter1 (GATE-REOPEN: R5.2 Leave/navigate path)

Gate check failed: **R5.2** ("Page teardown — close-room / **leave** / navigate / tab close — does not abort an
in-flight recording upload"). The fix covered `endForAll` (Close room) but NOT the **Leave** path.

## The single gap (execute ONLY this — preserve all other B5 changes)
- `justLeave()` (room.page.ts ~1563) → `directLeave(true)` (~1710) → `cleanupCall()` (~2681) → `this.recorder.discard()` (line 2696).
- Result: a host who is **recording** and clicks **"Leave"** (instead of "Close room"), or navigates away, **loses the recording** — it is discarded without an upload. JROM's requirement: closing/leaving the meeting must auto-stop + save the recording WITHOUT requiring a manual stop first.

## The fix
1. Extract the recording-flush logic you already wrote in `endForAll` (if `isRecording()` → `stop()` → `allSettled([upload(300_000), uploadPerUser])` → clear/retain the `recording-pending-<sessionId>` flag → on failure set `uploadFailed` + fire the T6 `recordCallIssue` notice) into a reusable async helper, e.g. `private async flushRecordingForExit(): Promise<boolean>` returning whether a failure occurred.
2. Call it from `endForAll` (replace the inline block) AND from `justLeave()` BEFORE `directLeave(true)` — so "Leave" saves the recording exactly like "Close room". If the flush reports a failure, surface the same T6 host notice + let the host acknowledge before leaving (mirror endForAll's reopen-dialog behavior) rather than silently discarding.
3. Leave `cleanupCall`'s `recorder.discard()` (2696) as the FINAL cleanup (it runs after the upload already happened, or for truly abrupt teardowns — ngOnDestroy / tab-close — where the T5 beforeunload guard + T7 reconciliation banner are the safety net). Do NOT try to make the synchronous cleanupCall upload.

## Scope
- ONLY the Leave-path save gap above. Do not widen. Preserve all T1-T7 work.
- Build the frontend until green. No git commit.
- Update batch-B5/changes.md with the helper extraction + the justLeave wiring.

## Callback contract (same batch, implementer role)
Your first tool call MUST be the callbacks.md append BEFORE any prose:
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B5 <WORKING|DONE|BLOCKED|NEEDS-INFO> "<note>"
```
Emit STATUS: DONE when the Leave path saves + build green. End reply with a `STATUS:` echo line.
