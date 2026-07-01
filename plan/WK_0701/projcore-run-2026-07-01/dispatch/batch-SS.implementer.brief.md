<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-SS: Screen-share infinite-mirror fix — Google-Meet "You're presenting" placeholder (R7)

Batch ID: batch-SS
Plan: plan/WK_0701/projcore-run-2026-07-01/implementation-plan.md
Branch: fix/sfu-selfheal-20260701 (commit on this branch — will merge to main after validation)
Requirements assigned: R7
Lifecycle: pre-live — Deferral OFF. No TODO/dead-code/shims. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: SHORT/MEDIUM (atomic UI fix). ~1-3 focused tests, tight diff.

Effort tier (PROJCORE-PROPOSED): medium
  Mode chord: /fast OFF · Claude marker "think hard"
  Validator topology: 3-agent (validator=codex55)
  Why: UI/render-path fix; must not regress the remote viewer's live share or the share strip/PIP.

User report (verbatim): "when sharing the screen can you just mark it similar to google meet so that it does
not do the infinite mirror thingy" — i.e. when JROM shares his screen and the shared surface contains the
call window, his own view shows the recursive hall-of-mirrors.

Requirement (R7): Screen-share must NOT infinite-mirror for the LOCAL presenter. Like Google Meet, the
presenter should see a "You're presenting" placeholder instead of a live self-view of their own share.
Remote viewers must STILL see the live shared screen (unchanged).

Root cause (confirmed):
- `frontend/src/app/pages/room/room.page.ts:477` — `shareStream` computed returns `this.media.screenStream()`
  (the local live screen) when `sharingPeer().isLocal` is true. That live self-view of your own screen, when
  the shared surface includes the app, feeds back into itself → infinite mirror.
- The main presented view is rendered in `room.page.html` from `shareStream` / `shareLayoutActive`.

Expected (acceptance criteria — assertable):
1. **R7a — no self-mirror:** when the LOCAL user is the presenter, the main presented/share view does NOT
   render their own live `screenStream()`. Instead show a Google-Meet-style **"You're presenting"** placeholder
   (reuse existing styles/controls; keep the Stop-share affordance reachable). `shareStream` returns null (or the
   template branches on `sharingPeer().isLocal`) so no local screen `<video>` element renders the self-share.
2. **R7b — remote unaffected:** a REMOTE viewer still receives + renders the presenter's live shared screen over
   the SFU (do NOT touch remoteScreenStreams rendering). The presenter's OUTBOUND screen publish is unchanged —
   only the presenter's own on-screen rendering of it changes.
3. **R7c — clean toggle:** starting/stopping share works; when share stops, layout returns to normal; the
   self-PIP/camera strip tile behavior is unchanged (it shows camera via effectiveLocalStream, not the screen).

Scope:
- ONLY the presenter's own rendering of their share. Do NOT change: the SFU publish path, remoteScreenStreams,
  the camera/self-PIP tiles, or any recovery logic (R1-R6 are validated + real-call-confirmed).
- Reproduce-first (§1.4h): confirm the mirror on the local presenter before fixing; retain a check.
- Robust assertions; wrap any timer-y tests in `timeout 25`. Rendered-DOM/screenshot proof for the placeholder.

Plan handshake protocol (MANDATORY):
1. Read this brief + room.page.ts shareStream/shareLayoutActive + the share-layout section of room.page.html.
2. Reply PROPOSED: mechanism (shareStream + template change + placeholder markup) + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at the agreed effort. STATUS: DONE when build + targeted tests green + terminating + screenshot captured.

Required artifacts: batch-SS/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ (presenter placeholder + remote-sees-share); decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-SS <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Use WORKING only for non-terminal progress. Emit terminal/handshake state directly when you have it.

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-SS[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
