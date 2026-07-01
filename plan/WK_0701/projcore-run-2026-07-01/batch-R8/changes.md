# Batch R8 — Changes

## Root cause

- **R8a:** `restoreSelection()` (auto-apply-on-join logic) lived inside `BackgroundPickerComponent`,
  which is lazily mounted only when the picker panel is opened (`room.page.html`,
  `@if (backgroundPickerOpen())`). It never ran on join.
- **R8b/R8c:** `PeerBackground` only ever carried `{kind, id}` over `media-state`. A custom/account
  image's `id` has no globally-resolvable meaning for a remote peer — the account-library image
  endpoint is cookie+ownership-gated (404s for other users), and anonymous uploads never leave
  localStorage — so remote tiles fell back to initials.

## Design decision (counter-proposal to the brief's "shared/served URL" suggestion)

Rather than opening or loosening a backend endpoint so peer B can fetch peer A's private
background image (a new cross-user access-control surface — exactly the RBAC question the brief
flagged), a compressed broadcast **thumbnail** (≤120KB raw / capped at 200,000 chars server-side)
is generated client-side and relayed through the **existing WS signaling channel**, the same trust
boundary that already carries SDP/media-state between call participants. No new backend auth
surface; the server-side cap is a hard DoS/size boundary independent of client compression.

## Code changes

### `backend/src/modules/signaling/index.ts`
- `IncomingMessage.image?: unknown` field.
- `MAX_BACKGROUND_IMAGE_CHARS` (200,000) + `BACKGROUND_IMAGE_DATA_URL_RE` (must be
  `data:image/(jpeg|png|webp);base64,...`).
- `parseBackgroundImage()` — hard size + format validation, independent of client-side compression.
- New `background-image` message handler: validates and relays `{clientId, image}` to all other
  admitted peers in the room (same broadcast pattern as `media-state`/`chat`).

### `frontend/src/app/services/ws.service.ts`
- `SignalingMessage`/`OutgoingSignalingMessage` gain a `background-image` variant. The existing
  `media-state.background` field (lightweight `{kind, id}`) is untouched — the heavy payload is a
  **separate** message type by design, so it can never accidentally piggyback onto mic/cam toggles.

### `frontend/src/app/services/background-effects.service.ts`
- `broadcastImage` signal (the thumbnail to send to peers) + `restoredFromStorage` signal (R8a
  idempotency guard, shared across every caller). Both reset in `dispose()` so a fresh join gets a
  fresh restore rather than staying stuck from a prior room in the same SPA session.

### `frontend/src/app/components/background-picker/background-restore.ts` (new)
Pure logic extracted out of the `@Component`-decorated file (only `import type`s of the two
Angular services it touches) so it's unit-testable with plain `tsx` — no DI context, no
`@angular/common/http` chain to bootstrap. Contains: localStorage read/write helpers, the builtin
background catalog, `resizeAndEncode`/thumbnail generation, `applyImageSelection()`, and
`restoreBackgroundFromStorage()` (R8a — idempotent via `effects.restoredFromStorage`, callable from
both the room page at join and the picker's own constructor if it happens to mount first).

### `frontend/src/app/components/background-picker/background-picker.component.ts`
- Slimmed to the `@Component` class; imports its logic from `background-restore.ts`.
- `select()` / restore now share `applyImageSelection()`; builtins never generate a broadcast
  thumbnail (already resolvable via `/assets/backgrounds/*.svg`), customs/account images do
  (`createBroadcastThumbnailFromDataUrl` for anonymous localStorage images,
  `createBroadcastThumbnailFromUrl` for account images — fetched via the owner's own authed
  session, never exposed to peers directly).
- `deleteCustom()` / non-image selects now explicitly clear `broadcastImage`.

### `frontend/src/app/services/peer-state.ts` — unchanged (resolver was already peer-agnostic)
`resolveCamOffBackdropUrl(background, localImageUrl)` never actually required the caller to be
local — that restriction lived entirely at the call site.

### `frontend/src/app/components/tile/tile.component.ts`
- `camOffBackdropUrl` no longer gates the broadcast image on `peer.isLocal` — this one-line removal
  is the actual R8b/R8c fix at the render layer. Still renders strictly via
  `[style.background-image]` (CSS-only, no `innerHTML`/script-executing surface — unchanged).

### `frontend/src/app/pages/room/room.page.ts`
- `PeerIdentity.backgroundImage?: string | null` — the received thumbnail for each remote peer.
- `bootstrap()` calls `restoreBackgroundFromStorage()` fire-and-forget, before the rest of the join
  flow (R8a).
- New effect sends `background-image` **only** when `backgroundEffects.broadcastImage()` actually
  changes and the call is active — separate from the existing media-state-on-descriptor-change
  effect, so mic/cam toggles never resend the image.
- Incoming `media-state`: if the new descriptor isn't a non-builtin image, `backgroundImage` is
  cleared immediately — prevents a stale thumbnail (from a background the peer switched away from)
  from lingering and being shown for the wrong `id`.
- New `background-image` message handler updates the sender's `PeerIdentity.backgroundImage`.
- `peer-joined`/`peer-resumed`: existing peers already re-broadcast `media-state` for a late
  joiner/resumer; now also re-send their current `broadcastImage` if one is active, so a peer who
  joins after a background was set still sees it.
- `peers` computed (remote branch): `backgroundImageUrl: identity.backgroundImage ?? null`.

## Tests

- `backend/tests/signaling-background-relay.test.ts` — 3 new cases: relay a valid thumbnail; drop
  an oversized one (proves the server doesn't trust client-side compression); reject a non-`data:
  image/*` payload. All 4 tests in the file green.
- `frontend/src/app/services/peer-state.spec.ts` (new) — `resolveCamOffBackdropUrl` deterministic
  proof that a remote peer's broadcast thumbnail resolves correctly (not just local), that a
  missing thumbnail falls back to null/initials rather than a stale image, and that non-image
  descriptors never leak a stale backdrop.
- `frontend/src/app/components/background-picker/restore-background-from-storage.spec.ts` (new) —
  R8a idempotency: a second caller (simulating the lazily-mounted picker racing the room page's
  join-time call) is a provable no-op even if storage changed in between.
- `frontend/src/app/components/tile/tile.component.spec.ts` — new case: a remote peer with a
  `backgroundImageUrl` set renders `.has-bg-image` with that URL, not `.avatar-initials`.

## Out of scope (unchanged)

- No recovery logic changes (R1–R6 coordinator/retry/rejoin/publish escalation).
- No screen-share changes (R7).
- `effectiveStreamForSourceTrack` / SFU publish mechanism for the cam-ON composited stream —
  untouched; regression already covered by the pre-existing `e2e/tests/background-effects.spec.ts`.
