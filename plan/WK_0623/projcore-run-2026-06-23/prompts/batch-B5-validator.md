<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B5 (VALIDATOR / reproduce-first): Recording lost on call end — reproduce + build the regression check

Batch ID: batch-B5
Role: validator (independent, UI-PROOF — you are the USER's clone, §1.11/§2.9)
Branch: feat/recording-reliability-b5
Requirements: R5.1 R5.2 R5.4 (the data-loss core)
Lifecycle: pre-live — Deferral OFF.

You are the INDEPENDENT validator for an ISSUE/regression (§1.4h reproduce-first). The implementer is fixing in parallel; you do NOT review its diff — you anchor to the USER's problem and reproduce it.

The reported issue (verbatim, JROM 2026-06-23):
"i just got off the call, and i believed i hit record but the app didnt record the call."

Established forensic reproduction (already on the rendered app — confirm it, then encode it):
- Real call today: room a78ae0bd02b6 "ReceiptBOT", host silverjrom, session 01:54→02:49 UTC. Logs show `type=recording-state` started 02:18 + stopped 02:49, but ZERO `[rec] saved` lines → no file saved. A successful record always logs `[rec] saved <file>`. Disk newest webm is from the prior day.
- Mechanism: client uploads the finished recording as one blob to POST /upload guarded by an 8s timeout (`frontend/src/app/pages/room/room.page.ts` ~1433); a ~25MB+ recording can't upload in 8s, and ending-the-call tears the page down ~1s later (endForAll close-room + delay), aborting the in-flight upload. Per-user uploads are fire-and-forget. `/upload` needs an open session that close-room closes.

YOUR TASKS:
1. CONFIRM the reproduction from the rendered app's perspective: re-derive the forensic evidence (grep the backend logs for `recording-state` vs `[rec] saved` for the broken session; confirm no file on disk for that session in `recordings/`). This is the on-screen/user-observable failure: host recorded, no recording exists in the Library.
2. BUILD a durable regression check: a Playwright e2e (under `e2e/tests/`) that records a meeting, forces the failure condition (throttle the /upload response or use a recording large enough that the upload exceeds the old 8s window), ends the call by the host LEAVING, then asserts a recording file IS saved + visible in the Library. On the CURRENT (pre-fix) code this test must FAIL (reproduces loss); after the implementer's fix it must PASS.
3. Emit STATUS: REPRO-CONFIRMED with the evidence (the failing test + the forensic confirmation). If you genuinely cannot reproduce on the rendered app after real effort, emit REPRO-FAILED with what you tried (do NOT fall back to a pure code-read as "confirmed").
4. After the implementer emits DONE and the frontend is rebuilt, RE-RUN your regression check on LOCAL and emit REPRO-CLEARED-ON-LOCAL (Q8) — a recording now saves through host-leave. Missing this line = evidence-quality FAIL regardless of the implementer's claims.

Scope: do NOT edit production code (verifier ≠ fixer). You may add test files under `e2e/`. Do NOT commit. Do NOT touch the SFU/media path.

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. If interrupted between prose and the tool call, the callback never lands and projcore stalls. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-B5 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-B5[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo (human-readable mirror only)
End your reply with `STATUS: <STATE> — <same short note>`. Callback file is the detection path; if they differ, callback wins.
