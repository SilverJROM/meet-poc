# OG Requirements — Phase 2a
**Created:** 2026-05-28
**Source:** JROM chat: "when requesting to share screen have a persistent approval once the approval has been granted no need to ask again, and when i try to share screen from a mobile device it does not seem to work fix this."

## R14 — Persistent screen-share approval per call

| Acceptance | Detail |
|------------|--------|
| Backend tracks grants | `live.shareGrants: Set<clientId>` per room. Add on `share-decision approved=true`, remove on peer-leave / revoke / room-close. |
| Approved peer skips re-request | When approved peer clicks Share again: backend immediately responds `share-decision approved=true` without notifying host. |
| New peer must request | Joining peer is NOT in grants set → first share triggers approval prompt as today. |
| Reset on peer-leave | Peer leaves → backend drops their grant. Rejoin = fresh approval needed. |
| Reset on room-close | Room closes → all grants cleared. |

## R15 — Mobile screen-share graceful fallback

| Acceptance | Detail |
|------------|--------|
| Feature detect | Check `typeof navigator.mediaDevices?.getDisplayMedia === 'function'` BEFORE calling. |
| Unsupported error | If unsupported: set `actionNotice('Screen sharing isn\'t available in this browser. Try Chrome on Android, Safari 16+ on iPhone, or join from a desktop.')`. Don't throw uncaught. |
| Supported path unchanged | Android Chrome, iOS Safari 16+, all desktop browsers: existing flow proceeds. |
| Detection point | Inside `media.service.ts toggleScreen()` BEFORE getDisplayMedia call OR inside `room.page.ts toggleScreen()` before invoking media.toggleScreen. Either is acceptable; pick the one that surfaces the error cleanly. |

## R16 — Host can revoke share permission for a peer

| Acceptance | Detail |
|------------|--------|
| Revoke control | In participant-sidebar host view, a small action per peer (next to mute/remove): "Revoke screen-share permission". Only visible IF peer is currently in `shareGrants`. Otherwise hidden (no clutter). |
| WS message | New: `{type: 'share-revoke', clientId}` host→backend. Backend removes from `shareGrants`, sends `share-revoked` to peer (acknowledgement). |
| Peer notification | Peer receives `share-revoked` → `actionNotice('Host revoked your screen-share permission. Your current share continues; next time you'll need to ask again.')`. |
| Does NOT stop in-progress | If peer is currently sharing: no track close. They just need to re-request next time. |

## R17 — Phase 2a test gate

| Acceptance | Detail |
|------------|--------|
| Builds | `cd backend && npm run build`, `cd frontend && ng build` — 0 errors. |
| Existing e2e | `fixloop-banner/` suite (13 specs) — all PASS. |
| New specs | `share-persistent.spec.ts` — host approves once, peer shares again without prompt. `share-revoke.spec.ts` — host revokes, peer's next share needs prompt. `share-mobile-fallback.spec.ts` — emulate undefined getDisplayMedia, click share, assert actionNotice shown. |
