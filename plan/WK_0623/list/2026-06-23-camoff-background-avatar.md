---
date: 2026-06-23
type: improvement
status: planned (scope A/B pending; implementation gated behind go)
agent: projcore
qa_verification: pending
---

# Camera-off tile keeps virtual background + initials on upper side

## JROM verbatim
> "when i hide my cam or disable my cam if i have a background its still shows on my avatar, just put in like
> my abreviated name like 'JO' on the upper side of it but i still want to retain the background even when i
> close my camera"

## Disposition
Designed in `projcore-run-2026-06-23/` (north-star Issue #4, decision `2026-06-23-camoff-background-avatar.md`,
req-matrix R4.1–R4.5, plan `B4-camoff-background.md`). Cam-off tile shows the image background as backdrop +
initials top-left, fallback to today's avatar for blur/none. **One open decision: scope A (own self-view,
frontend-only) vs B (all participants see it — needs the background choice broadcast over signaling; custom
uploads need shareable image).** No implementation until go.
