# Batch B4 — Independent validation handoff

## Evidence for validator (codex55 UI-PROOF)
1. Screenshot: `screenshots/camoff-bg-tile.png`
2. DOM markers: `.camera-off-avatar.has-bg-image`, `.initials-chip` (see `tile.component.html`)
3. Signaling: `media-state` carries `background: { kind, id? }` — grep `parsePeerBackground` in `signaling/index.ts`

## Suggested validator steps
1. Join room with built-in bg (city) → turn cam off → confirm backdrop + top-left initials (self + remote client)
2. Select blur → cam off → confirm centered avatar fallback
3. Cam on with image bg → confirm live composite still works
4. Confirm overlays (mute badge, host, quality pill) still render

## Build commands (repro)
```bash
cd frontend && npm run build
cd backend && npm run build
```