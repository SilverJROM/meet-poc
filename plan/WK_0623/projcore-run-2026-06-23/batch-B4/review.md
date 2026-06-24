# Batch B4 — Self-review

## Requirements coverage
| Req | Status | Notes |
|-----|--------|-------|
| R4.1 | PASS | `has-bg-image` cam-off branch with cover backdrop |
| R4.2 | PASS | `.initials-chip` top-left with scrim gradient |
| R4.3 | PASS | blur/none/unresolvable → centered `avatar-initials` |
| R4.4 | PASS | `media-state.background` broadcast + built-in asset resolve |
| R4.5 | PASS | `showVideo()` and compositing path untouched |

## Risks mitigated
- Custom remote display deferred: `resolveCamOffBackdropUrl` returns null for non-built-in ids on remote peers
- Bg broadcast uses `untracked()` so mic/cam toggles don't duplicate bg-only sends
- Backend validates kind enum + id length ≤128

## Open follow-ons
- Room-scoped served URL for custom background remote display (out of scope)