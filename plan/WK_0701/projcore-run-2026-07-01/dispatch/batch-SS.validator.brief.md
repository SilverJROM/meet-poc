<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-SS VALIDATION: screen-share infinite-mirror fix (R7)

Role: independent validator (codex55). Implementer Sonnet. Changes UNCOMMITTED on fix/sfu-selfheal-20260701
(`git diff`). Coordinator already verified: shareStream→null for local peer; new presenting-placeholder.spec.ts
PASSES; ng build clean; senderSnapshot confirmed a dead hook (pre-existing rot).

Batch ID: batch-SS · Requirement R7.

## Audit
1. **R7a no self-mirror:** confirm `shareStream` returns null for `sharingPeer().isLocal` and the template
   renders a "You're presenting" placeholder (no local screen <video>). room.page.ts/html/scss.
2. **R7b remote unaffected:** confirm the REMOTE path is untouched — remoteScreenStreams rendering + the
   outbound screen publish are unchanged; a guest still sees the live share. The new spec asserts a guest sees
   `app-tile ... video` of the share — confirm that assertion is real (not vacuous).
3. **R7c toggle:** stop-share returns to grid (.share-stage count 0).
4. **New spec honest:** read tests/batch-ss-presenting-placeholder/presenting-placeholder.spec.ts — it must
   genuinely assert the placeholder (no video/mirror) for host AND the live share video for a guest. Re-run it:
   `cd e2e && E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 timeout 4m npx playwright test tests/batch-ss-presenting-placeholder --config=playwright.config.ts --workers=1`
5. **Assertion swaps legitimate:** the 4 legacy spec swaps (share-reflow, meet-ui, share-camera-cut, tilefix)
   must assert the NEW correct behavior (.presenting-placeholder), NOT delete/weaken coverage. 2 of them
   (share-camera-cut, tilefix) are blocked EARLIER by PRE-EXISTING rot (senderSnapshot dead hook; camera-mirror
   CSS) — confirm that rot predates R7 (stash/base check) and is genuinely out of scope, NOT introduced by this diff.
6. **No regression:** R1-R6 recovery + camera self-PIP/strip tiles untouched. Confirm sfu-client.service.ts
   recovery methods have 0 changes from this batch.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-SS/independent-validation.md`. Per criterion.
Screenshots exist at batch-SS/screenshots/ — confirm they show the placeholder + remote-share (not blank/login).

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-SS <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if R7a/b/c hold + new spec honest + swaps legit + rot confirmed pre-existing + no regression;
**REPRO-STILL-PRESENT** if a real defect (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-SS[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
