<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-B4: Camera-off tile keeps the virtual background + initials (scope B — everyone sees it)

Batch ID: batch-B4
Plan: /home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/plan/B4-camoff-background.md
Branch: feat/recording-reliability-b5 (run branch — accumulate; no commit)
Requirements assigned: R4.1 R4.2 R4.3 R4.4 R4.5
North-star anchors: Issue #4, decision 2026-06-23-camoff-background-avatar.md (scope B locked).
Lifecycle: pre-live — Deferral OFF.

Estimated duration: SHORT — 30min. Effort: medium · validator=codex55 (UI-PROOF).

Context:
JROM: "when i hide/disable my cam if i have a background it still shows on my avatar, just put my abbreviated name 'JO' on the upper side, retain the background even when i close my camera." Today `frontend/src/app/components/tile/tile.component.html` (~line 14-20): when `showVideo()` is false it renders `.camera-off-avatar` = a solid `avatarColor()` circle with CENTERED `initials()`. The virtual background is composited client-side (MediaPipe, `background-effects.service.ts`) into the OUTGOING video and is NOT broadcast — so others don't know a peer's bg. SCOPE = B (JROM locked): EVERYONE sees the user's background + initials when that user's cam is off → broadcast the bg choice over signaling; built-in backgrounds by id first, custom = fallback-avatar for others.

Requirements (verbatim):
"R4.1 Cam off AND image background set → tile backdrop shows that background image (not solid avatar color). R4.2 Initials ('JO') on the UPPER side of the tile, legible over the image (scrim/chip). R4.3 Fallback: no image bg (blur/none) → current centered solid-color avatar unchanged. R4.4 Other participants also see the user's bg + initials when that user's cam is off (scope B). R4.5 No regression to live video, bg compositing while cam on, or other overlays."

Expected (acceptance — implement ALL):
1. R4.1/R4.2/R4.3: Extend the tile `@else` (cam-off) branch: when the peer has an IMAGE background, render it as a cover backdrop (`has-bg-image` state) with initials top-left over a contrast scrim/chip; when no image bg (blur/none) → today's centered solid-color avatar.
2. R4.4 (scope B broadcast): add a small `background` descriptor (e.g. `{ kind: 'image'|'blur'|'none', id?: string }`) to peer state broadcast over signaling — `frontend/src/app/services/ws.service.ts` send on bg change + `backend/src/modules/signaling/index.ts` relay it in peer-state to all participants; remote tiles resolve BUILT-IN backgrounds by id (from `frontend/src/assets/backgrounds`). Custom-uploaded backgrounds: send the descriptor but remote display falls back to the avatar (custom remote display is a follow-on) — the OWNER's own self-view still shows their custom bg locally.
3. Keep the payload tiny (send the id/kind, NEVER the image bytes).
4. R4.5: live video + cam-on compositing + mic/host/quality overlays unchanged.

Likely files:
- frontend/src/app/components/tile/tile.component.{ts,html,scss}
- frontend/src/app/services/background-effects.service.ts (expose the current bg descriptor)
- frontend/src/app/services/ws.service.ts (broadcast bg change)
- frontend/src/app/pages/room/room.page.ts (peer-state model: add background field)
- backend/src/modules/signaling/index.ts (relay background in peer-state)

Scope:
- ONLY R4.1-R4.5. Do NOT change the recording/transcription/superuser code or the media path beyond the small peer-state field.
- No git commit. Build frontend green; typecheck backend if touched.
- UI-PROOF: rendered-DOM/screenshot showing a cam-off tile with the bg image + upper initials (and the fallback avatar for blur/none).

Plan handshake (MANDATORY): 1. Read brief + tile + bg service + ws/signaling. 2. PROPOSED: mechanism + files + risks + estimate. 3. tier. 4. STATUS: PROPOSED — <approach> · complexity · why. 5. WAIT for APPROVED-PLAN before coding. 6. REVISE→re-emit.
After APPROVED-PLAN: 7. Implement; build green; capture UI proof. 8. STATUS: DONE.

Required artifacts: batch-B4/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/ + decisions/<date>-<slug>.md (or "Autonomous decisions: none").

---

## Streaming-order mandate
Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below) — not the first sentence, the first TOOL CALL, BEFORE any prose tokens stream. Append first, prose after.

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0623/projcore-run-2026-06-23/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-B4 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-B4[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <same short note>`. Callback file wins on mismatch.
