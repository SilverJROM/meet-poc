# Batch R8 — Scenarios

User report (verbatim): "add a capability to choose a default background so that i dont need to keep
selecting it everytime joining the call, and also using the background even when i'm not opening my camera
and it showing to all users not just me fix that"

## R8a — Default persistence + auto-apply on join

**Reproduce (confirmed before fix):** `BackgroundPickerComponent` already wrote the selection to
localStorage and had a `restoreSelection()` method that applied it — but the component is lazily
mounted (`room.page.html`, `@if (backgroundPickerOpen())`), only instantiated when the picker panel
is opened. `restoreSelection()` never ran on join, so JROM had to re-select every call.

**Scenario:**
1. Select a background (builtin, or a custom/account image), leave the call.
2. Rejoin the same room (or a different room, same browser session).
3. Expected: the background is already active before the user opens the picker — no re-selection.
4. Assert: `restoreBackgroundFromStorage()` (extracted, shared, idempotent) applies the persisted
   selection to `BackgroundEffectsService` at room bootstrap, independent of picker mount state.

## R8b — Custom backgrounds visible to ALL peers

**Reproduce (confirmed before fix):** `PeerBackground` only ever carried `{kind, id}` over
`media-state`. For a custom (uploaded) image, `id` has no globally-resolvable meaning — an
account-library image is served from a cookie+ownership-gated endpoint
(`/api/account/backgrounds/:id/image`, 404s for any other user), and an anonymous upload never
leaves localStorage. A remote peer had no way to resolve either into an image, so their tile fell
back to initials.

**Scenario:**
1. Host (signed-in) uploads a custom background and selects it.
2. A remote peer in the same call must be able to render it.
3. Expected: a small (~capped) broadcast thumbnail is generated client-side and relayed over the
   existing WS signaling channel — the same trust boundary that already carries SDP/media-state
   between call participants — rather than opening a new cross-user access endpoint (avoids the
   RBAC question the brief flagged).
4. Assert: `parsePeerBackground`'s sibling `parseBackgroundImage` relays a valid thumbnail and
   rejects/drops anything oversized or not a `data:image/*` URL (backend test). On the frontend,
   `resolveCamOffBackdropUrl` resolves a remote peer's thumbnail exactly like a local one once the
   `isLocal` gate is removed at the tile-component call site (unit + component test).

## R8c — Background applies with camera OFF, to everyone

Falls out of R8b: the "shows initials, not the chosen background" symptom on cam-off *is* the
missing image data reaching `resolveCamOffBackdropUrl` for remote peers. Builtins already worked
(served as static assets); custom/account images now do too via the R8b broadcast.

**Regression:** cam-ON virtual background must still publish the composited stream to remotes
(unchanged mechanism — `effectiveStreamForSourceTrack` / `BackgroundEffectsService.processStream`,
not touched by this batch). Covered by the pre-existing `e2e/tests/background-effects.spec.ts`
(local composite-track proof); see test-report.md for why a live 2-participant proof of this
specific sub-point was not pursued in this batch.
