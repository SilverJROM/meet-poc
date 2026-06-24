# Batch B4 — Changes

## Frontend
- `peer-state.ts` — `PeerBackground` type, built-in id resolver, `resolveCamOffBackdropUrl()`
- `background-effects.service.ts` — `backgroundDescriptor` + `localBackgroundImageUrl` signals; `setBackgroundDescriptor()`
- `background-picker.component.ts` — sync descriptor on select/restore
- `tile.component.{ts,html,scss}` — cam-off image backdrop + top-left initials chip; fallback avatar preserved
- `ws.service.ts` — optional `background` on `media-state` messages
- `room.page.ts` — `PeerIdentity.background`, local peer merge, broadcast + receive, bg-change effect

## Backend
- `signaling/index.ts` — `parsePeerBackground()` + relay `background` in `media-state`

## Payload contract
```ts
{ kind: 'none' | 'blur' | 'image'; id?: string }
```
Id/kind only — never image bytes.