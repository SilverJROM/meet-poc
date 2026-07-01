<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-R8 VALIDATION: backgrounds — default persist + visible to all peers (R8)

Role: independent validator (codex55). Implementer Sonnet. Changes UNCOMMITTED on fix/sfu-selfheal-20260701.
Coordinator pre-verified: R1-R7 zero-diff (sfu-client.service.ts=0, shareStream=0); restore + resolver + tile
(ng test 3/3) + backend cap (4/4) all pass; ng build clean; the 2-participant custom-bg e2e was descoped to
unit/component per a coordinator redirect (headless MediaPipe flake).

Batch ID: batch-R8 · Requirement R8.

## Audit
1. **R8a default persist + auto-apply on join:** the restore logic was extracted to
   background-restore.ts (restoreBackgroundFromStorage) and now fires at JOIN (not only when the lazy picker
   mounts), idempotently. Read the wiring in room.page.ts; confirm the restore-background-from-storage.spec
   asserts a persisted selection is applied on (re)join. Run: `cd frontend && timeout 25 npx tsx src/app/components/background-picker/restore-background-from-storage.spec.ts`.
2. **R8b/R8c custom bg visible to ALL peers (the core fix):** confirm the root cause — tile.component.ts
   previously passed `backgroundImageUrl` only for `peer.isLocal` (remote → null → initials); now passes it for
   ALL peers. Confirm the custom image reaches remotes: a DEDICATED background-image WS message (NOT piggybacked
   on media-state) broadcasts a size-capped thumbnail; backend signaling parsePeerBackground enforces a HARD
   server-side size cap. Run: `cd frontend && timeout 25 npx tsx src/app/services/peer-state.spec.ts` (resolver)
   + `cd frontend && timeout 180 npx ng test` (tile component 3/3 incl. "remote peer's custom background not
   initials") + `npm test -w backend -- signaling-background-relay` (cap, 4/4). Confirm these assert OUTCOMES.
3. **Server size cap is a real boundary:** confirm parsePeerBackground REJECTS/caps oversized image payloads
   server-side (client compression is not the boundary). Render path: data URL used ONLY as a CSS
   background-image (no innerHTML/script surface).
4. **Cam-on virtual bg regression:** the processed (bg) stream is still published (effectiveTrackId != rawTrackId).
5. **No R1-R7 regression:** `git diff -- frontend/src/app/services/sfu-client.service.ts` = 0 lines; shareStream
   unchanged. Confirm.
6. **e2e descope acceptable:** confirm the descope to unit/component (per the flaky-headless-MediaPipe redirect)
   still PROVES R8b/c (remote receives+resolves+renders custom bg) — i.e. the coverage is real, not a gap.

## Output
Write verdict to `plan/WK_0701/projcore-run-2026-07-01/batch-R8/independent-validation.md`. Per criterion.

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh validator batch-R8 <STATE> "<note>"
```
The callback line template is: [projcore callback] <role> <batch-id> STATUS:

## Role-scoped closed enum (anything else = INVALID-STATE)
```
implementer states: PROPOSED | REVISE-PLAN | WORKING | DONE | BLOCKED | NEEDS-INFO
validator states: WORKING | REPRO-CONFIRMED | REPRO-FAILED | REPRO-CLEARED-ON-LOCAL | REPRO-STILL-PRESENT | BLOCKED | NEEDS-INFO
NEVER emit (coordinator-only): APPROVED-PLAN | GATE-REOPEN | ACK
```
Emit **REPRO-CLEARED-ON-LOCAL** if R8a/b/c hold + server cap real + no R1-R7 regression + tests honest;
**REPRO-STILL-PRESENT** if a real defect (name it).

## ACK stop-rule
Before emitting any callback, run:
```
grep -E '^\[projcore ACK\][[:space:]]+validator[[:space:]]+batch-R8[[:space:]]+RECEIVED[[:space:]]+REPRO-CLEARED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: WORKING
