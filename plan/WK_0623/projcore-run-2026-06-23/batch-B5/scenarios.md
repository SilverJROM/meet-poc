# Batch B5 — Scenarios

## S1: Long recording saved when host ends call (R5.1, R5.2, R5.3)

**Setup**: Host starts recording. Call runs ≥20 min (≥20 MB audio blob). Host opens leave dialog → clicks "Close room".

**Expected**:
- Status shows "Saving recording… don't close the tab." while upload is in flight.
- `ws.send({type:'close-room'})` is NOT sent until both `recorder.upload()` and `recorder.uploadPerUser()` have settled.
- Upload completes (no 8s truncation). `[rec] saved` appears in backend logs.
- File is present in the recordings Library.
- `recording-pending-<sessionId>` key is removed from localStorage on success.
- Host is then navigated to /app/rooms.

**Outcome assertion**: file exists server-side with correct byte count. NOT: just that the upload call was fired.

---

## S2: Per-user recordings saved (R5.4)

**Setup**: 2+ participants in a ≥20-min call. Host ends for all.

**Expected**:
- Per-user `.webm` + `participant.json` files are present in the session directory after call end.
- No file is missing due to fire-and-forget.

**Outcome assertion**: `ls -lh <session-dir>/per-user/` shows files for each connected participant.

---

## S3: Upload timeout shows host failure notice (R5.5)

**Setup**: Simulate upload failure (kill backend mid-upload or use network throttle to force timeout). Host ends call.

**Expected**:
- Leave dialog is re-opened (not navigated away) with "Recording could not be saved — upload failed or timed out." in the issues list.
- `recording-pending-<sessionId>` key remains in localStorage.
- Host can click "Close room" again (without recording) or "Leave" to navigate away.

**Outcome assertion**: callIssues contains the recording failure text; browser remains on room page.

---

## S4: beforeunload guard during in-flight upload (R5.2)

**Setup**: Start recording. Manually stop recording (toggleRecording). Immediately try to close the browser tab while upload is in progress.

**Expected**:
- Browser shows "Changes may not be saved" native dialog.
- Upload is not aborted by the tab close.

**Note**: This guard does NOT fire during programmatic end-call navigation (Angular SPA router does not trigger beforeunload).

---

## S5: Reconciliation banner on rooms page (R5.6)

**Setup**: Start a recording. Simulate a hard crash (force-kill tab while recording-pending key is set). Re-open the app and navigate to /app/rooms.

**Expected**:
- Yellow banner shows: "A recording from your last session may not have saved."
- Dismissing the banner removes the localStorage key(s).

**Outcome assertion**: `localStorage.getItem('recording-pending-*')` is null after dismiss.

---

## S6: Short recording still works (R5.7 — no regression)

**Setup**: Record a 30-second call. Host manually stops recording via toggleRecording button. No page navigation.

**Expected**:
- Upload completes within the 5-min window (seconds in practice).
- "Recording saved: <file>" status shown.
- Per-user files present.

---

## S7: International call path unaffected (R5.7)

**Setup**: Run a call with RTT ≥150ms (international route). Record and end normally.

**Expected**:
- No regressions in signaling, SFU path, or media quality.
- Recording upload uses the same path (no change to SFU/TURN wiring).

---

## S8: Capstone — Peer2 e2e (R5.1, R5.4, R5.5, R5.7)

Manual verification by coordinator using Peer2's machine (JohnnyOne relay):

1. Record a ≥20-min real call (host on local, Peer2 remote).
2. Host ends for all → confirm `[rec] saved` in server logs + file in Library + per-user files.
3. Force upload failure → confirm host sees failure notice in leave dialog.
4. Short recording → confirm it still works.
5. International call path check → no regression.
