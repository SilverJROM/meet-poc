# North-Star — Phase 2a: persistent share-approval + mobile share fallback
**Date:** 2026-05-28
**Pattern:** 2 — codex-in-tmux (parent `lkvc-38`, child `lkvc-38-codex` to be spawned)
**OVM session:** `lkvc-38`
**Lifecycle:** pre-live (deferral OFF)

## Locked decisions

| # | Decision | Answer |
|---|----------|--------|
| D1 | Persistent share-approval scope | **Per-call only.** Approval persists while peer stays admitted. Reset when peer leaves; reset when room closes. NO cross-call persistence. |
| D2 | Mobile share UX | **Graceful "use desktop" message.** Feature-detect `navigator.mediaDevices.getDisplayMedia`. On unsupported (iOS pre-16 / in-app browsers): show actionable inline error. On supported mobile (Android Chrome, iOS Safari 16+): let getDisplayMedia run, user picks tab/window. |
| D3 | Phase 2 ordering | **2a (now): persistent approval + mobile fallback.** 2b (later): background blur + 5 generic + custom upload. 2c (later): 10+ country-themed art. |
| D4 | Revocation | **Yes, host can revoke** during call. Revoke clears the grant (future share-requests need approval again). Does NOT force-stop an in-progress share. |
| D5 | Test gate | Build + e2e regression + new spec for persistent-approval + mobile-fallback. |
| D6 | Commits | One commit per batch on `fix/sfu-audio-publish-guard`. |

## Phase 2a requirements (this run)

| ID | Requirement |
|----|-------------|
| R14 | Persistent screen-share approval per call. After host approves, peer can share again without re-request UNTIL peer leaves or host revokes. Approvals stored per-call in backend live-room state. |
| R15 | Mobile screen-share graceful fallback. Feature-detect getDisplayMedia. Unsupported → inline error "Screen sharing requires Chrome on Android or Safari 16+ on iPhone, or use a desktop browser." Supported → existing flow continues. |
| R16 | Host can revoke screen-share permission for a specific peer. Small "Revoke share permission" action in participant-sidebar OR a chip next to peer name. Revoke does NOT force-stop in-progress share — only clears the persistent grant. |

## Scope boundary

**IN:** `backend/src/modules/signaling/index.ts` (track per-call grants), `frontend/src/app/pages/room/room.page.ts` (request flow), `frontend/src/app/services/media.service.ts` (feature detect), `frontend/src/app/components/participant-sidebar/*` (revoke control).

**OUT:** background effects (Phase 2b), custom upload (Phase 2b), all in-call UI changes beyond the revoke chip.
