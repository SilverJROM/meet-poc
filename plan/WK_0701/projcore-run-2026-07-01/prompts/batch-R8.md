<!-- PROJCORE-STATUS-CONTRACT v2 -->
Batch-R8: Backgrounds — persist+auto-apply default; custom backgrounds visible to ALL peers (R8)

Batch ID: batch-R8
Branch: fix/sfu-selfheal-20260701 (commit here — merges to main with the rest)
Requirements assigned: R8
Lifecycle: pre-live — Deferral OFF. No TODO/dead-code/shims. Uncertainty = STATUS: NEEDS-INFO.

Estimated duration: MEDIUM. ~2-4 focused tests, tight diff.

Effort tier (PROJCORE-PROPOSED): medium
  Mode chord: /fast OFF · Claude marker "think hard"
  Validator topology: 3-agent (validator=codex55)
  Why: touches persistence + WS peer-state signaling + custom-image serving; must not regress recovery/publish.

User report (verbatim, JROM): "add a capability to choose a default background so that i dont need to keep
selecting it everytime joining the call, and also using the background even when i'm not opening my camera
and it showing to all users not just me fix that"

Three sub-requirements (R8):
- R8a **Default persistence + auto-apply on join:** remember the chosen background and auto-apply it when
  joining a call, so JROM never re-selects. (The picker already writes localStorage — the gap is READING +
  applying it on join.)
- R8b **Custom backgrounds visible to ALL peers:** a CUSTOM (uploaded) background currently uses a LOCAL-only
  URL, so remote peers fall back to initials ("showing to all users not just me"). Make custom backgrounds
  resolvable by every peer (a shared/served URL) and propagate it.
- R8c **Background applies with camera OFF, to everyone:** the cam-off tile must show the chosen background to
  the local user AND remote viewers (builtins already work; custom depends on R8b).

Investigation (confirmed — build on this, verify at reproduce):
- Picker persistence: `frontend/src/app/components/background-picker/background-picker.component.ts` uses
  localStorage (STORAGE_KEY for the selection; customStorageKey(id) for custom image data). It SAVES; the gap
  is auto-applying on join.
- Peer propagation: `frontend/src/app/services/ws.service.ts` `media-state` message carries
  `background?: PeerBackground` ({kind, id}); room.page.ts:360 sends `backgroundEffects.backgroundDescriptor()`.
- Resolution: `frontend/src/app/services/peer-state.ts` `resolveCamOffBackdropUrl(background, localImageUrl)` —
  for kind:'image', uses `localImageUrl` (LOCAL peer only) else `resolveBuiltinBackgroundUrl(id)` (builtins →
  `/assets/backgrounds/{id}.svg`, everyone can load). CUSTOM images have NO globally-resolvable URL → remote
  peers can't render them. `PeerBackground` = {kind, id} (no shared URL).
- Custom backgrounds are stored server-side: migration `0011_user_backgrounds.sql` (user_backgrounds table) —
  check for/serve a public URL (e.g. an endpoint that returns a user's background image by id) so remote peers
  can resolve a custom bg.
- Publish uses processed stream: `effectiveStreamForSourceTrack` (room.page.ts:1380) returns
  `backgroundEffects.processStream(...)` when bg active → cam-ON virtual bg reaches remotes (verify).

Expected (acceptance criteria — assertable):
1. R8a: on join, the saved background selection (builtin OR custom) is auto-applied — no manual re-select.
   Persists across rejoin. Assert via a test that a persisted selection is active after (re)join.
2. R8b: a custom background is resolvable by a REMOTE peer — propagate a globally-loadable URL (or a resolvable
   id backed by a served endpoint) through the peer-state/media-state so remotes render the custom bg. Assert a
   2nd participant sees the custom background (cam-on stream and/or cam-off tile), not initials.
3. R8c: cam-OFF tile shows the chosen background to local AND remote (builtin already; custom via R8b). Assert.
4. Cam-ON virtual bg still reaches remotes (processed stream published) — regression check.

Scope:
- Backgrounds only. Do NOT change recovery logic (R1-R6), the screen-share fix (R7), or the SFU publish
  mechanism beyond what's needed to carry the processed stream (already in place).
- If serving custom images needs a small backend endpoint, gate it properly (owner/auth as appropriate) —
  surface via NEEDS-INFO if an auth/security boundary decision is required (do not guess RBAC).
- Reproduce-first (§1.4h): confirm each gap (re-select-every-join; remote sees initials for custom) before fixing.
- Tests fake-timed where possible; e2e for the remote-visibility proof. Wrap runs in sane timeouts. Screenshots.

Plan handshake protocol (MANDATORY):
1. Read this brief + the referenced files + how custom backgrounds are stored/served (user_backgrounds).
2. Reply PROPOSED: mechanism per sub-req (a/b/c) + files + risks + estimate. Confirm/counter tier.
3. End: STATUS: PROPOSED — <approach> · complexity: <x> · why: <one line>.
4. Wait for APPROVED-PLAN. If REVISE-PLAN, address + re-emit.

After APPROVED-PLAN:
5. Implement at medium effort. STATUS: DONE when build + targeted tests green + terminating + screenshots.

Required artifacts: batch-R8/{scenarios,changes,review,test-report,independent-validation}.md + screenshots/; decisions/<date>-<slug>.md (or "none").

---

## Streaming-order mandate
**Your first tool call in every reply MUST be the `callbacks.md` append (via the helper below). The first tool call BEFORE any prose tokens stream.**

## Callback emission — the ONLY sanctioned form
```
PROJCORE_CALLBACKS_FILE=/home/agjrom/websites/meet-poc/plan/WK_0701/projcore-run-2026-07-01/callbacks.md \
  ~/.claude/agents/lib/projcore-emit-status.sh implementer batch-R8 <STATE> "<note>"
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
grep -E '^\[projcore ACK\][[:space:]]+implementer[[:space:]]+batch-R8[[:space:]]+RECEIVED' "$PROJCORE_CALLBACKS_FILE"
```
If a matching line exists — STOP emitting callbacks for this batch.

## Optional pane-STATUS echo
End your reply with `STATUS: <STATE> — <note>`. Callback file wins if they differ.

STATUS: PROPOSED
