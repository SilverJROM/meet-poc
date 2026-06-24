# Batch B5 — Code Review

## Verdict: PASS with notes

All T1–T7 tasks implemented. Build clean. No type errors introduced.

---

## T1 — Upload timeout change

**Changed**: `withTimeout(recorder.upload(...), 8000, null)` → `300_000` at both sites (toggleRecording + endForAll).

**Correct**: The 8s cap was the primary truncation point. 5 min (300s) is a reasonable sane cap — prevents indefinite hang on a dead uplink while giving a real recording adequate time.

**Note**: `withTimeout` on `recorder.stop()` remains at 8s — this guards only the in-memory MediaRecorder finalization, which should complete in milliseconds. No change needed there.

---

## T2 — Reorder endForAll

**Changed**: `close-room` now sent AFTER `Promise.allSettled([upload, uploadPerUser])`.

**Correct**: The backend `/upload` requires an open session. The old ordering (close-room → delay(1000) → navigate with uploads still running) guaranteed session-closed failures for any upload slower than 1 second.

**Risk noted and acceptable**: Participants experience a delay of up to 5 minutes before receiving `close-room` if upload is slow. They are still in the call during this window. This is correct behavior — the alternative was silent data loss.

**`Promise.allSettled` vs `Promise.all`**: Correct choice. If the main upload rejects quickly, `Promise.all` would short-circuit, orphaning the per-user upload (which may still be streaming to the server). `allSettled` waits for both to settle.

---

## T3 — Await uploadPerUser

**Changed**: `void this.recorder.uploadPerUser(...)` → `await ...` in toggleRecording; included in `allSettled` pair in endForAll.

**Correct**: `uploadPerUser` catches errors per-clientId internally and does not throw. Awaiting it is safe. The old `void` meant per-user files were lost on any call path that involved page navigation or session close before the uploads finished.

---

## T4 — keepalive: true on uploadMetadata only

**Changed**: Added `keepalive: true` to `/api/recordings/upload-metadata` fetch only.

**Correct lock honored**: `keepalive` is NOT added to `recorder.upload()` (blob, up to 25MB+) or `uploadPerUser()` (per-user blobs). Browser keepalive is ~64KB-capped — adding it to large blob fetches would cause the browser to silently drop the body, breaking the upload. The metadata JSON is tens of bytes, well within keepalive limits.

---

## T5 — beforeunload guard

**Changed**: Early return with `event.preventDefault()` + `returnValue = ''` when `event.type === 'beforeunload'` and `this.recorder.isUploading()`.

**Correct**: Does not block Angular SPA navigation (router.navigate does not trigger `beforeunload`). Guards only browser-initiated tab/window close. Returns early, skipping `decideRoomLifecycleLeave` + `cleanupCall` — correct, because we don't want to destroy the WebSocket/PeerConnection while upload is in flight from a browser tab-close that the user might cancel.

**Edge case**: If the user clicks OK on the native dialog anyway, the page unloads and the upload is aborted. This is expected — we warned them.

---

## T6 — Failure notice in leave dialog

**Changed**: `uploadFailed` flag, `recordCallIssue(...)`, `leaveDialogOpen.set(false)` then `queueMicrotask(() => leaveDialogOpen.set(true))`.

**Correct**: The `queueMicrotask` is necessary because the dialog component's `busy` signal is internal state. If we set `leaveDialogOpen(false)` then `leaveDialogOpen(true)` synchronously, Angular's change detection might batch them and never actually destroy + recreate the component (so `busy` would remain `true` from the first "Close room" click). `queueMicrotask` gives Angular one render tick to process the `false` before the `true`, ensuring a fresh instance.

**Second click path**: `endForAll()` is re-entered, `recorder.isRecording()` is false (was already stopped), the recording block is skipped, `close-room` is sent again (idempotent on the backend), and navigation proceeds. Clean.

**Note**: `recordCallIssue` is already used for speaker-unavailable issues. The leave dialog shows all `callIssues` in a list. The minor label fix ("device issue" → "issue") makes the wording correct for recording failures.

---

## T7 — localStorage reconciliation

**Changed**: Set `recording-pending-<sessionId>` on recording start; remove on successful upload (both in toggleRecording and endForAll). Rooms page constructor scans and signals banner.

**Correct**: The key is set BEFORE the ws.send `recording-state:started` broadcast (consistent with the recording being "in progress"). Cleared only on verified upload success. Persists across hard crashes, tab closes, and network failures — which is exactly when the banner should appear.

**Edge case**: If a user records multiple sessions from the same browser, multiple `recording-pending-*` keys may accumulate. `dismissRecordingWarning` scans and removes all of them. This is correct.

---

## Scope discipline

- No changes to SFU/TURN media path. ✓
- No chunked upload infrastructure (B5b deferred). ✓
- No new backend routes. ✓
- No `.skip` / `TODO` / deferred shims introduced. ✓
- Phase 2 not touched. ✓
