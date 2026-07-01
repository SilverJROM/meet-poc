# Batch R8 — Review

## Requirements coverage

| Req | Status | Evidence |
|-----|--------|----------|
| R8a — persist + auto-apply on join | ✅ PASS | `restoreBackgroundFromStorage()` extracted out of the lazily-mounted picker into `background-restore.ts`, called from `room.page.ts` `bootstrap()`; idempotent via `effects.restoredFromStorage` — proven by `restore-background-from-storage.spec.ts` |
| R8b — custom backgrounds visible to all peers | ✅ PASS | Broadcast thumbnail relayed via new `background-image` WS message (backend `parseBackgroundImage` + relay, 4/4 tests green); resolved on the receiving side via existing `resolveCamOffBackdropUrl` — proven by `peer-state.spec.ts` |
| R8c — cam-off shows the background, to everyone | ✅ PASS | `tile.component.ts` no longer restricts `backgroundImageUrl` to `peer.isLocal`; DOM-level proof in `tile.component.spec.ts` (new case) |
| R8c regression — cam-ON virtual bg still reaches remotes | ✅ N/A — unchanged | `effectiveStreamForSourceTrack`/`processStream` not touched by this batch; regression coverage is the pre-existing `background-effects.spec.ts` (local composite-track proof) |

## NAIL THESE (coordinator's APPROVED-PLAN callout) — self-check before DONE

1. **Server-side hard size cap, not trusting client compression.** `MAX_BACKGROUND_IMAGE_CHARS =
   200_000` + `BACKGROUND_IMAGE_DATA_URL_RE` format check in `parseBackgroundImage`
   (`backend/src/modules/signaling/index.ts`) — independent of the client's own ~120KB thumbnail
   cap. Backend test explicitly sends an oversized payload and proves it's dropped, not relayed.
2. **Efficient send — once per background-set/join, not on every media-state toggle.** The
   `background-image` message is a **separate WS message type** from `media-state`, sent by its
   own `effect()` watching `backgroundEffects.broadcastImage()` — structurally decoupled from the
   mic/cam-toggle-triggered `broadcastMediaState()` calls, not just "usually doesn't fire together."
   The lightweight `{kind, id}` descriptor keeps flowing on `media-state` unchanged.
3. **CSS `background-image` only, no innerHTML.** Unchanged rendering path — `tile.component.html`
   already used `[style.background-image]="'url(' + camOffBackdropUrl() + ')'"`; the R8b/R8c fix
   is exclusively removing the `isLocal` gate that fed that binding, not the binding itself.
4. **R8a idempotent, one shared flag, no flicker.** `effects.restoredFromStorage` is checked and
   set synchronously (before any `await`) at the top of `restoreBackgroundFromStorage` — whichever
   caller (room page at join, or the picker's own constructor) reaches it first wins; the other is
   provably a no-op (test scenario S-5 in `restore-background-from-storage.spec.ts`).
5. **Zero lines in `sfu-client.service.ts` recovery + shareStream.** Confirmed via
   `git status --porcelain` — neither file appears in this batch's diff.
6. **e2e proof of remote-visible custom bg, cam-on regression check.** Descoped per coordinator's
   mid-batch redirect (headless MediaPipe/2-participant flake) to the deterministic
   unit(`peer-state.spec.ts`) + component(`tile.component.spec.ts`) pair, which together prove
   receive → resolve → render for a remote peer without a live e2e. See test-report.md for the
   full rationale and an incidental unrelated pre-existing e2e finding.

## Scope discipline

- ✅ No recovery logic touched (R1–R6).
- ✅ No screen-share logic touched (R7).
- ✅ Additive wire changes only — new `background-image` message type; existing `media-state`
  shape unchanged.
- ✅ No new backend auth/access-control surface — the RBAC question the brief flagged is avoided
  entirely by relaying image bytes over the existing per-call signaling trust boundary instead of
  exposing/loosening the private account-background endpoint.

## Risks / notes

- Broadcast fan-out is O(room size) per background change (confirmed safe up to the 30-peer room
  cap during PROPOSED-phase investigation); no debounce added since `broadcastImage` only changes
  on an actual user action (select/upload/delete), not on a timer.
- `background-restore.ts` is a genuinely new module (pure logic extracted from the component) —
  this is the mechanism that made R8a's idempotency independently testable; flagging in case
  codex55 wants to confirm the extraction didn't change behavior (diff is a straight move + the new
  `restoredFromStorage` guard, no logic rewritten beyond that).
