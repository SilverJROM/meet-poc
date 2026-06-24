# Batch plan — B4: Camera-off background + upper initials

> Gated: no implementation until JROM's "go". Atomic tasks (<30min). Covers req-matrix R4.1–R4.5.
> Decision: `decisions/2026-06-23-camoff-background-avatar.md`. **Scope = B (locked, JROM 2026-06-23):
> everyone sees it. Build Scope-A rendering first (subset), then layer Scope-B broadcast. Built-in
> backgrounds first; custom remote-display is a follow-on.**

## Affected surfaces
- `frontend/src/app/components/tile/tile.component.{ts,html,scss}` — cam-off `@else` branch + styles.
- (Scope B only) `frontend/src/app/services/ws.service.ts` + `backend/src/modules/signaling/index.ts` —
  broadcast a `background` field on peer state; `room.page.ts` peer model.
- Background image resolution: built-in `assets/backgrounds/*`; account `/api/account/backgrounds/:id/image`.

## Tasks — Scope A (own self-view; frontend-only)

**B4A-T1 — Tile cam-off image backdrop.** Extend `.camera-off-avatar` `@else` branch: when the local peer has
an image background selected, render the image as a cover backdrop with a `has-bg-image` state. (R4.1)

**B4A-T2 — Upper initials + contrast.** Move initials to top-left over the image with a scrim/chip for
legibility; keep centered solid-color avatar when no image bg. (R4.2, R4.3)

**B4A-T3 — Wire the local selected-background into the tile.** Pass the current background image ref to the
local tile (signal/input). No backend. (R4.1)

**B4A-T4 — Validation.** Cam on → composite intact; cam off + image bg → backdrop+upper initials; cam off no
bg → today's avatar; overlays intact. (R4.5) Rendered UI-PROOF.

## Tasks — Scope B (everyone sees it) — ONLY if JROM picks B

**B4B-T1 — Broadcast background choice.** Add a small `background` descriptor (id + kind built-in|custom) to
peer state over signaling; update on change. Keep payload tiny (id, never the image). (R4.4)

**B4B-T2 — Remote resolution.** Remote tiles resolve built-in backgrounds by id from assets. (R4.4)

**B4B-T3 — Custom-background access (decision).** Either (i) restrict remote display to built-in backgrounds
first (custom shows fallback avatar to others), or (ii) add a room-scoped served image URL. Recommend (i)
first. (R4.4)

**B4B-T4 — Apply A's tile rendering to ALL peers** (not just local), driven by the broadcast field. (R4.1, R4.2)

**B4B-T5 — Validation (2-client).** Second client sees peer's bg+upper-initials on cam-off; no regression. (R4.4, R4.5)

## Sequencing
Smallest of the four batches. Scope A is a quick frontend win and is a strict subset of B (B's tile rendering
reuses A's). If B is chosen, build A's tile rendering first, then layer the broadcast.
