# Req coverage matrix — Phase 2a — FINAL

| Req# | Requirement (verbatim, first 80 chars) | Batch | Evidence | Status |
|------|---------------------------------------|-------|----------|--------|
| R14 | Persistent screen-share approval per call (host approves once) | A | validation + `share-persistent.spec.ts` + backend `live.shareGrants` Set with peer-leave cleanup | **VERIFIED** |
| R15 | Mobile screen-share graceful fallback ("use desktop" message) | A | validation + `share-mobile-fallback.spec.ts` + media.service feature-detect getDisplayMedia | **VERIFIED** |
| R16 | Host can revoke screen-share permission for a peer | A | validation + `share-revoke.spec.ts` + participant-sidebar revoke control + share-revoke WS message | **VERIFIED** |
| R17 | Phase 2a test gate (builds + e2e + 3 new specs) | A | 16/16 e2e PASS (13 existing + 3 new) on commit 98ecad8 | **VERIFIED** |

**ALL 4/4 reqs VERIFIED.**

## Batch summary
| Batch | Reqs | Commit | Branch | e2e |
|-------|------|--------|--------|-----|
| A | R14, R15, R16, R17 | `98ecad8` | `feat/share-persistence-mobile-revoke-20260528` | 16/16 |

## Notes
- Codex created its own feature branch `feat/share-persistence-mobile-revoke-20260528` instead of stacking on `fix/sfu-audio-publish-guard`. Branch isolation is sensible per the new label refactor. Deployed code = this branch (current checkout).
- During implementation codex restarted the backend outside PM2's control. Projcore restored PM2 ownership before independent validation.
