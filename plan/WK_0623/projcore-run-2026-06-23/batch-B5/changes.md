# Batch B5 — Changes

## User Report (verbatim)

> "recordings lost on call end"

From the B5 deliberation context: real recordings are silently lost when the host ends a long call. No error is shown. The recording file never appears in the Library. The issue is present on real ≥20-min calls.

---

## Root Cause Mechanism

Three concurrent failure modes:

**1. 8-second timeout truncates the upload fetch.**
`room.page.ts` `toggleRecording()` ~1433 and `endForAll()` ~1571:
```
withTimeout(this.recorder.upload(blob, this.roomId), 8000, null)
```
A 25MB+ webm at typical upload speeds takes 60–120 seconds minimum. The 8-second cap guarantees `null` return (silent discard) for any long call. The blob is thrown away with no user notification.

**2. `close-room` fires before uploads complete, closing the session the upload needs.**
`endForAll()` original ordering:
```
stop() → upload() [8s cap] → void uploadPerUser() → ws.send({close-room}) → delay(1000) → navigate
```
The backend `/upload` handler requires an open session. `close-room` closes it immediately. Per-user uploads (`void this.recorder.uploadPerUser(...)`) were fire-and-forget (no await) — no guarantee they run before the session closes or the page navigates.

**3. Page teardown aborts any in-flight fetch.**
After `directLeave()` → `router.navigate()`, Angular triggers page transition ~1s after `close-room`. Any fetch still in flight is aborted by the browser. No `beforeunload` guard existed to warn the user.

Secondary: no user-visible failure notice (T6), no crash/tab-close reconciliation key (T7).

---

## Code Changes

### `frontend/src/app/services/recorder.service.ts`

**T4 — keepalive on `uploadMetadata()` only.**
The metadata upload is a small JSON payload (well under the browser's 64KB keepalive cap). Adding `keepalive: true` makes the metadata ping survive a navigation event.
`upload()` and `uploadPerUser()` send large audio blobs — keepalive is explicitly NOT added there (browser silently drops keepalive requests over ~64KB, which would BREAK the recording upload).

```diff
  const res = await fetch('/api/recordings/upload-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, metadata }),
+   keepalive: true,
  });
```

---

### `frontend/src/app/pages/room/room.page.ts`

**T1 — 5-minute cap replaces the 8-second cap on `recorder.upload()`** (both sites: `toggleRecording` ~1435, `flushRecordingForExit` ~1612).
`withTimeout(..., 8000, null)` → `withTimeout(..., 300_000, null)`.
The 8s guard on `recorder.stop()` is kept unchanged — that only waits for the MediaRecorder to finalize in-memory, not for network I/O.

**T2 — Await all uploads BEFORE `close-room` (in `endForAll` via `flushRecordingForExit`).**
Old ordering: `stop → upload (8s cap) → close-room → navigate`.
New ordering: `stop → show "Saving recording…" status → await upload (5min) + uploadPerUser (concurrent, allSettled) → close-room → navigate`.
`Promise.allSettled` is used so a rejection in the main upload does not orphan the per-user upload coroutine.

**T3 — Await `uploadPerUser()` (was fire-and-forget `void`).**
In `toggleRecording()` (~1443): `void this.recorder.uploadPerUser(...)` → `await this.recorder.uploadPerUser(...)`.
In `flushRecordingForExit()` (~1613): part of the `Promise.allSettled` pair, so inherently awaited.

**`flushRecordingForExit()` helper — iter1 gap fix (R5.2 Leave path).**
The iter1 gap: `justLeave()` → `directLeave(true)` → `cleanupCall()` → `recorder.discard()` discarded the recording without saving. A host who is recording and clicks "Leave" (instead of "Close room") silently lost the recording.

Fix: extracted the recording-flush logic from `endForAll` into a private helper `flushRecordingForExit(): Promise<boolean>` that returns `true` if the upload failed. The helper:
1. Guards on `recorder.isRecording()` (returns false immediately if not recording).
2. Shows "Saving recording… don't close the tab." status.
3. Stops the recorder (8s timeout on stop), broadcasts `recording-state:stopped`.
4. If blob is produced: runs `upload (5min)` + `uploadPerUser` concurrently via `Promise.allSettled`.
5. On success: clears the `recording-pending-<sessionId>` localStorage key; returns `false`.
6. On failure (upload null/rejected/throw): returns `true`.
7. If blob is null (stop timed out): returns `false`; the T7 reconciliation key stays set so the banner appears on the next rooms-page visit.

Both `endForAll` and `justLeave` now call this helper BEFORE `close-room` / `directLeave`. `cleanupCall`'s `recorder.discard()` remains as the final cleanup for abrupt teardowns (ngOnDestroy, tab-close) where the T5 beforeunload guard and T7 banner are the safety net.

**T5 — `beforeunload` guard when upload is in flight.**
In `handlePageLifecycleLeave` (~3168+): if `event.type === 'beforeunload'` and `this.recorder.isUploading()`, call `event.preventDefault()` + `(event as BeforeUnloadEvent).returnValue = ''`. Return early — do not tear down the call. Angular SPA navigation (`directLeave → router.navigate`) does not trigger `beforeunload`, so this guard never fires on the programmatic end-call path.

**T6 — Clear failure notice in leave dialog on upload failure.**
On `flushRecordingForExit()` returning `true` (failure): `this.recordCallIssue('Recording could not be saved — upload failed or timed out.')`, close the leave dialog, then `queueMicrotask` to re-open it. The microtask gives Angular one tick to destroy the dialog component (resetting its internal `busy` signal to `false`) before recreating it. Both `endForAll` and `justLeave` mirror this behavior. The host sees the re-opened dialog with the issue listed, and can click "Leave" or "Close room" (second call: `recorder.isRecording()` is false, helper returns immediately, proceeds to close-room/navigate).

**T7 — `localStorage` reconciliation flag (set/clear).**
On recording start (`toggleRecording`, ws.send `recording-state:started`): `localStorage.setItem('recording-pending-<sessionId>', '1')`.
On successful upload in `toggleRecording`: `localStorage.removeItem('recording-pending-<sessionId>')`.
On successful upload in `flushRecordingForExit` (both `endForAll` and `justLeave` paths): same removal. Key stays set on failure or crash.

---

### `frontend/src/app/pages/rooms/rooms.page.ts` + `.html` + `.scss`

**T7 — Reconciliation banner on rooms page load.**
Constructor scans `localStorage` for any `recording-pending-*` key. If found, sets `pendingRecordingWarning` signal to `true`.
`dismissRecordingWarning()` method clears all `recording-pending-*` keys and hides the banner.
HTML: yellow dismissible banner rendered when `pendingRecordingWarning()` is true.
SCSS: `.recording-warning-banner` + `.banner-dismiss` styles (yellow/amber theme matching warning severity).

---

### `frontend/src/app/components/leave-dialog/leave-dialog.component.html`

**T6 (minor) — Label update.**
"device issue" → "issue" in the `callIssues` section header so the wording is correct for recording failures (not just device issues). One-word change.

---

## Manual Verification Checklist (for coordinator / Peer2 e2e)

- [ ] Record a ≥20-min call. Host ends for all. Confirm `[rec] saved` in server logs and file present in Library with correct byte count.
- [ ] Per-user `.webm` + `participant.json` files present in `<session-dir>/per-user/` after call end.
- [ ] Force upload failure (kill backend mid-upload or throttle to <1KB/s). Confirm leave dialog re-opens with "Recording could not be saved" issue. Confirm localStorage key stays set.
- [ ] Close browser tab while upload is in progress. Confirm browser shows "changes may not be saved" native dialog (beforeunload guard).
- [ ] Hard-crash during active recording. Re-open /app/rooms. Confirm yellow banner shows. Dismiss. Confirm localStorage key is cleared.
- [ ] Short recording (30s). Manual stop via toggleRecording. Confirm "Recording saved: <file>" and per-user files present.
- [ ] International call (Peer2 e2e): ≥20-min recording, end-for-all, confirm recording saved, no SFU/TURN regression.
