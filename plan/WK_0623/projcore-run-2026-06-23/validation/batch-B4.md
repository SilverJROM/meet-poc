# Validation — batch-B4 (cam-off background, scope B) — VERDICT: PASS
Date 2026-06-23. Independent gate. Impl: grok composer.
- tile @else: camOffBackdropUrl() → .has-bg-image background-image backdrop + .initials-chip (upper); else → solid avatarColor() + initials (fallback). (R4.1, R4.2, R4.3)
- signaling RelayPeerBackground = {kind:'none'|'blur'|'image', id?} relayed in peer-state — NO image bytes (R4.4). ws.service broadcasts on bg change; built-in by id.
- live-video @if(showVideo()) branch + overlays unchanged (R4.5). fe-tsc 0, be-tsc 0.
- UI-PROOF: batch-B4/screenshots/camoff-bg-tile.png.
R4.1-R4.5 VERIFIED. B4 COMPLETE.
