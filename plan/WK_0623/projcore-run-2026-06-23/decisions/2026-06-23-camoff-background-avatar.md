---
date: 2026-06-23
slug: camoff-background-avatar
source: projcore
issue: "#4 — camera-off tile keeps virtual background + initials on upper side"
status: locked-by-JROM 2026-06-23 — scope B (everyone sees it)
---

# Decision — Camera-off tile keeps the virtual background + initials

## JROM's verbatim ask
> "when i hide my cam or disable my cam if i have a background its still shows on my avatar, just put in like
> my abreviated name like 'JO' on the upper side of it but i still want to retain the background even when i
> close my camera"

## Current behavior (investigated)
- `frontend/src/app/components/tile/tile.component.html:14-20`: when `showVideo()` is false, the tile renders
  `.camera-off-avatar` = a solid `avatarColor()` circle with **centered** initials (`toInitials(peer.name)`).
- Virtual background = client-side **MediaPipe SelfieSegmentation** composite
  (`background-effects.service.ts`), baked into the **outgoing video stream**. The background image comes from
  `/api/account/backgrounds/:id/image` (account/custom) or `frontend/src/assets/backgrounds` (built-in).
- The background choice is **NOT broadcast over signaling** — only the local browser knows which background a
  user picked. When cam is off there is no video and no background data on the wire.

## Target behavior
When camera is OFF **and** an **image** background is set:
- Tile backdrop = that **background image** (cover-fit), instead of the solid avatar color.
- Initials ('JO') rendered on the **upper side** of the tile (top-left), not centered, legible over the image
  (chip/scrim for contrast).
- Mic/host/quality overlays unchanged.
When no image background (blur or none) → keep the current centered solid-color avatar (fallback).

## SCOPE — RESOLVED: Option B (JROM, 2026-06-23)
**Everyone sees it.** When a user's cam is off, every participant's view of that user's tile shows the
user's background + upper initials. Build A's tile rendering first (it's a subset), then broadcast the
background choice over signaling. **Built-in backgrounds first** (resolve by id); custom-uploaded backgrounds
fall back to the avatar for *other* viewers initially (custom remote-display = follow-on). The owner's own
self-view shows custom backgrounds fine (local). See `plan/B4-camoff-background.md` Scope-B tasks.

## (original analysis) scope options
**Option A — own self-view only (small, frontend-only).** Only the local user's own tile shows the
background + upper initials when they cut their cam. Other participants still see the plain avatar.
- Work: tile component reads the local selected-background image (already known client-side) + CSS for the
  upper-initials + image backdrop. No backend, no protocol change.

**Option B — visible to everyone (bigger).** Every participant's render of the user's tile shows that user's
background + upper initials when their cam is off.
- Work: broadcast the user's background choice over signaling (a `background` field on peer state); remote
  tiles resolve the image. Built-in backgrounds resolve by id directly; **custom-uploaded** backgrounds need a
  shareable served image (current `/api/account/backgrounds/:id/image` is owner-scoped — would need a
  room-scoped/served variant or to restrict this feature to built-in backgrounds for remote display).
- Risk: cross-user access to custom background images; extra peer-state plumbing; keep payload small (send id,
  not the image).

**Recommendation:** confirm with JROM. If the goal is "others see my branded presence when my cam is off,"
that's **B** (and likely restrict the broadcast to built-in backgrounds first, custom as a follow-on). If he
just wants his own view to look right, **A** is a quick win. Default lean: **B for built-in backgrounds**,
A-grade behavior automatically covered since the local tile is one of the participants.

## Notes
- `toInitials` + `avatarColor` already exist — reuse. Initials position is a CSS move + a new "has-bg-image"
  state on `.camera-off-avatar`.
- `showVideo()` already gates video vs avatar — extend the `@else` branch.
- Applies to image backgrounds only; blur/none falls back to today's avatar.
