# Batch B5 — Test Report

## Build status

```
✔ Build complete — 3.784s
  Application bundle generation complete [2026-06-23T06:29:50.514Z]
  No TypeScript errors.
  No new warnings introduced (2 pre-existing warnings: stencil glob + mediapipe CommonJS).
```

---

## Static verification (grep checks)

All T1–T7 markers confirmed present in source:

| Task | Marker | File:Line | Status |
|------|--------|-----------|--------|
| T1 | `300_000` (upload cap) | room.page.ts:1435, 1580 | ✓ |
| T2 | `Promise.allSettled` before `close-room` | room.page.ts:1579 | ✓ |
| T3 | `await this.recorder.uploadPerUser` | room.page.ts:1443, 1581 | ✓ |
| T4 | `keepalive: true` on uploadMetadata only | recorder.service.ts:469 | ✓ |
| T5 | `this.recorder.isUploading()` in beforeunload | room.page.ts:3168 | ✓ |
| T6 | `uploadFailed`, `queueMicrotask`, `recordCallIssue` | room.page.ts:1569,1602,1607 | ✓ |
| T7 set | `localStorage.setItem('recording-pending-')` | room.page.ts:1423 | ✓ |
| T7 clear | `localStorage.removeItem('recording-pending-')` | room.page.ts:1441, 1586 | ✓ |
| T7 scan | `startsWith('recording-pending-')` | rooms.page.ts:59 | ✓ |
| T4 NOT on upload | no `keepalive` in `upload()` or `uploadPerUser()` | recorder.service.ts | ✓ |

---

## Functional checks (manual, local dev)

> Note: The ≥20-min real-call + Peer2 e2e capstone requires the coordinator's sign-off. These are local targeted checks only.

### T1 — Timeout change

Verified by code inspection: `withTimeout(this.recorder.upload(...), 300_000, null)` at both call sites. Previous 8000 value is completely absent from upload paths (only `recorder.stop()` retains 8000).

### T2 — close-room ordering

Code path in `endForAll()`:
1. `this.status.set("Saving recording… don't close the tab.")` ← shown to host
2. `Promise.allSettled([upload, uploadPerUser])` ← awaited
3. `this.ws.send({ type: 'close-room' })` ← AFTER allSettled resolves

Old `ws.send({close-room})` at room.page.ts former ~1578 is confirmed absent; new placement is at ~1597 (after the recording block).

### T3 — await uploadPerUser

`void this.recorder.uploadPerUser` pattern: confirmed absent from all call paths. Both sites use `await`.

### T4 — keepalive lock

`keepalive: true` appears exactly once (recorder.service.ts uploadMetadata). Confirmed absent from `upload()` at line 248 and `uploadPerUser()` at line 518.

### T5 — beforeunload guard

`handlePageLifecycleLeave` now has early-return guard:
```ts
if (event.type === 'beforeunload' && this.recorder.isUploading()) {
  event.preventDefault();
  (event as BeforeUnloadEvent).returnValue = '';
  return;
}
```
The `isUploading` signal is set to `true` inside `recorder.upload()` at line 246, cleared in `finally` at line 263.

### T6 — Failure notice

`endForAll` finally block structure confirmed:
- `uploadFailed = true` set on: (a) main upload returns null, (b) upload throws, (c) recorder.stop throws
- `recordCallIssue('Recording could not be saved — upload failed or timed out.')` called
- `leaveDialogOpen.set(false)` → `queueMicrotask(() => leaveDialogOpen.set(true))` sequence confirmed

### T7 — LocalStorage flag + rooms banner

- `recording-pending-${startSessionId}` set immediately after recording starts
- Cleared after successful upload in both `toggleRecording` and `endForAll`
- Rooms page constructor scan confirmed; `dismissRecordingWarning` confirmed
- Banner HTML + SCSS confirmed in `rooms.page.html` and `rooms.page.scss`

---

## Outstanding: coordinator-gated capstone (S8)

- [ ] ≥20-min real call with Peer2 (JohnnyOne relay): recording saved, per-user files present
- [ ] Force upload failure: leave dialog re-opens with failure notice
- [ ] International call path: no regression
- [ ] Hard crash / tab-close: rooms page banner appears on return

**Gate**: REPRO-CONFIRMED from codex55 validator before final gate.
