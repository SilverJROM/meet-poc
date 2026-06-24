# Batch B5 — Implementation Autonomous Decisions

Date: 2026-06-23
Batch: B5 (recording reliability)
Decided by: implementer (Sonnet)

---

## D1: `Promise.allSettled` instead of `Promise.all` for concurrent uploads in `endForAll`

**Context**: T2 requires upload + uploadPerUser to both complete before `close-room`. I needed to run them concurrently to minimize delay.

**Decision**: Used `Promise.allSettled([upload, uploadPerUser])` rather than `Promise.all`.

**Why**: `Promise.all` short-circuits on the first rejection. If `recorder.upload()` rejects quickly (e.g., fetch throws immediately on network error), `Promise.all` would discard the `uploadPerUser` promise — the per-user blobs might still be mid-transfer and the settled promise state abandons them. `allSettled` waits for both to settle regardless, ensuring the per-user upload runs to completion or failure before we move on.

**Risk**: None identified. `uploadPerUser` already catches errors internally per-clientId and always fulfills.

---

## D2: `queueMicrotask` to close-then-reopen the leave dialog on upload failure (T6)

**Context**: On upload failure, T6 requires re-opening the leave dialog so the host sees the callIssue. The dialog's `busy` signal is internal component state (set to `true` when host clicked "Close room"). If we just `leaveDialogOpen.set(true)` without closing first, Angular may not destroy + recreate the component, so `busy` stays `true` and the dialog is stuck showing "Finalizing meeting..." with buttons disabled.

**Decision**: In `endForAll` finally block: `leaveDialogOpen.set(false)` then `queueMicrotask(() => leaveDialogOpen.set(true))`. The microtask fires after the current task (after Angular has processed the `false` signal and destroyed the dialog component), so the re-open creates a fresh instance with `busy = false`.

**Why not `setTimeout(fn, 0)`**: `queueMicrotask` is more deterministic — it fires after all synchronous code and microtasks in the current task, but before the next macrotask. `setTimeout(0)` schedules a macrotask, which could delay rendering by one additional frame. Both would work; `queueMicrotask` is tighter.

**Risk**: Very low. Angular's change detection runs after each task boundary. The `queueMicrotask` ensures the `@if (leaveDialogOpen())` block has processed `false` before we set `true`.

---

## D3: localStorage key retention on upload failure (T7)

**Context**: T7 says "clear on successful upload." Not explicit about what to do when upload fails in `toggleRecording`.

**Decision**: If the upload times out (`withTimeout` returns `null`) in `toggleRecording`, the status is set to "Recording stopped, but upload timed out." and we `return` early — without clearing the localStorage key. The key stays set.

**Why**: If upload fails, the recording was NOT saved. The key should persist so the reconciliation banner appears on the next rooms-page load. Clearing the key on failure would defeat the purpose of T7.

---

## D4: Status message wording for T2 saving state

**Context**: T2 requires showing a blocking status message while recording uploads in `endForAll`. The brief said "Saving recording… don't close the tab." — I used the exact copy verbatim.

**Decision**: `this.status.set("Saving recording… don't close the tab.")` using the Unicode ellipsis (…) and curly apostrophe (') matching the existing UI style.

**Autonomous decisions total**: 4 (all minor implementation detail choices within the APPROVED-PLAN scope).
