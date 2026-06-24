<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B5: Recordings must actually save when the host ends a long call (Phase 1, Option B hardened teardown)

Batch ID: batch-B5
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B5-recording-reliability.md
Branch: feat/recording-reliability-b5
Requirements assigned: R5.1 R5.2 R5.3 R5.4 R5.5 R5.6 R5.7
North-star anchors: Issue #5 (recording lost on call end), Sacred constraints (intl call path, real-call acceptance), MANDATORY Peer2 e2e capstone.
Lifecycle: pre-live — Deferral policy: OFF. Read `~/.claude/JROM/style/deferral-policy.md`. Under OFF: no TODO/FIXME, no "follow-up PR," no dead-code shims, no @deprecated markers without a queue.md row in THIS run. Uncertainty = STATUS: NEEDS-INFO, not a defer. (Phase 2 chunked-upload is already a logged queue follow-on — do NOT build it here.)

Estimated duration: NON-ATOMIC exception (tightly-coupled teardown sequencing across 3 files) — 45min

Effort tier (PROJCORE-PROPOSED — confirm or counter-propose at PROPOSED): high
  Mode chord: /fast OFF · Claude thinking marker "think hard"
  Validator topology: 3-agent (validator=codex55, independent, UI-PROOF)
  Why: critical real-call DATA LOSS, multi-file teardown/race fix; correctness dominates speed.

Context (from the B5 deliberation + codex55 APPROVED-PLAN):
This is an ISSUE/regression: real recordings are silently lost. Root cause: the finished recording uploads as ONE blob to POST /upload guarded by an 8-SECOND timeout; a real ~25MB+ recording can't upload in 8s, and stopping-by-ending-the-call tears the page down ~1s later, ABORTING the in-flight upload. Also per-user uploads are fire-and-forget, and /upload requires an OPEN session while close-room closes it immediately. A 3-agent deliberation (Sonnet+codex55+grok) converged on Option B (hardened teardown) for THIS batch; Option A (chunked-during-call) is a SEPARATE scheduled follow-on — out of scope here.

Requirements section (verbatim from req-matrix.md):
"R5.1 A real-length recording (>=20 min / >=20 MB) stopped by ending/leaving the call is reliably saved. R5.2 Page teardown (close-room/leave/navigate/tab close) does not abort an in-flight recording upload. R5.3 The 8s upload timeout no longer truncates large uploads (timeout only guards MediaRecorder stop). R5.4 Per-user recordings are saved with the same reliability (not fire-and-forget). R5.5 If a recording cannot be saved, the host is told clearly at end-of-call. R5.6 Post-session reconciliation: recording-state started with no saved file is flagged. R5.7 No regression: short recordings + existing save path still work; international call path unaffected."

Observed (current state, file:line):
- `frontend/src/app/pages/room/room.page.ts` `toggleRecording()` ~1410, `endForAll()` ~1564, cleanup/`directLeave` ~1555: `withTimeout(this.recorder.upload(blob,this.roomId), 8000, null)` (8s cap), `void this.recorder.uploadPerUser(...)` (fire-and-forget), and `endForAll` sends `close-room` then `await delay(1000)` then teardown.
- `frontend/src/app/services/recorder.service.ts` `stop()`, `upload()` ~248, `uploadPerUser()` ~518, `uploadMetadata()` ~465.
- `backend/src/modules/recording/index.ts` `/upload` handler requires an open meeting session.

Expected (acceptance criteria — implement ALL, Phase 1 Option B):
1. T1 — Replace the 8s cap on `recorder.upload()` with a 5-minute sane cap at BOTH sites (toggleRecording ~1433, endForAll ~1571). Keep `withTimeout(this.recorder.stop(), 8000, null)` unchanged. (R5.3)
2. T2 — Reorder `endForAll` (and any leave/cleanup that uploads) so mix upload AND per-user uploads are awaited and FINISH before `ws.send({type:'close-room'})`. Show a blocking "Saving recording… don't close the tab" status while uploading. (R5.2)
3. T3 — `await this.recorder.uploadPerUser(this.roomId)` (drop `void`) inside the guarded flush in toggleRecording (~1439) and endForAll (~1572). (R5.4)
4. T4 — Add `keepalive: true` ONLY to `uploadMetadata()` and any small reconciliation ping — NOT to `upload()` or `uploadPerUser()` (large blobs; keepalive is ~64KB-capped and would BREAK a 25MB fetch). (R5.2)
5. T5 — beforeunload guard: if `recorder.isUploading()`, `event.preventDefault()` + `event.returnValue=''`. Must NOT block the awaited programmatic `endForAll`. (R5.2)
6. T6 — On upload failure in endForAll/toggleRecording, surface a clear end-of-call host notice via the existing `callIssues` + leave-dialog mechanism (see the speaker-unavailable wiring) — not a transient status line. (R5.5)
7. T7 — localStorage `recording-pending-<sessionId>` set on recording start, cleared on successful upload; on rooms page load (`frontend/src/app/pages/rooms/rooms.page.ts`) if it persists, show a dismissible banner "A recording from your last session may not have saved." (R5.6)
8. T8 — In changes.md, leave a manual-verification checklist (the real >=20min call + Peer2 e2e is run by the coordinator).

Likely files:
- frontend/src/app/pages/room/room.page.ts
- frontend/src/app/services/recorder.service.ts
- frontend/src/app/pages/rooms/rooms.page.ts
- frontend/src/app/components/leave-dialog/leave-dialog.component.{ts,html} (reuse callIssues path)

Scope:
- Implement only Phase 1 Option B for R5.1–R5.7. ONE coherent slice; tight diff.
- Do NOT build Phase 2 (no chunked/streaming upload, no new backend chunk routes).
- Do NOT touch the SFU/TURN media path or signaling beyond the close-room ordering in T2.
- Do NOT git commit (JROM standing rule — commit only when explicitly asked). Leave working-tree changes.
- Do NOT change the international call path. Surgical only — no "while I'm in here" creep.
- Robust polled assertions; assert the OUTCOME (file saved / not saved), not that a call fired.
- Escape valve: if an ideal proof is infeasible, fall back to the simpler proof and note it.
- Wait for the validator's REPRO-CONFIRMED in callbacks.md before treating the fix as gateable (the coordinator gates on it).

Plan handshake protocol (MANDATORY before implementation):
1. Read this brief in full. Read referenced files.
2. Reply with PROPOSED: mechanism-level diagnosis + planned files + risks + estimate confirmation.
3. Confirm or counter-propose the effort tier (one-line "why"). Higher wins on conflict.
4. End reply with: STATUS: PROPOSED — <one-line approach> · complexity: <confirmed-or-counter> · why: <one line>.
5. Wait for projcore APPROVED-PLAN before writing code.
6. If REVISE-PLAN returned, address gaps, re-emit STATUS: PROPOSED.

After APPROVED-PLAN:
7. Implement at the agreed mode chord (apply "think hard"). Build the frontend (`cd frontend && npm run build`) until it passes — the app is served from the build output (voice.silverjrom.app = localhost:4700). Fix any type errors you introduce.
8. Reply with STATUS: DONE — <one-line summary> when build + targeted checks green.

Required artifacts:
- batch-B5/scenarios.md
- batch-B5/changes.md (User Report verbatim + Root Cause mechanism + Code Changes per-file WHY)
- batch-B5/review.md
- batch-B5/test-report.md
- batch-B5/screenshots/
- batch-B5/independent-validation.md
- decisions/<YYYY-MM-DD>-<slug>.md per §1.15 — MANDATORY for any non-trivial autonomous call (if none, state explicitly: "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. If your session is interrupted between prose-streaming and the tool call, the callback never lands and projcore stalls. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B5 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states:   WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO

NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B5[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)
End your reply with `STATUS: <STATE> — <same short note>` for readability. Callback file is the detection path; if they differ, callback wins.
