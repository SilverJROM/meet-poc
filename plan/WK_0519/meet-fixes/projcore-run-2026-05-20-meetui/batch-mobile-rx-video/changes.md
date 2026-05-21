# Batch mobile-rx-video Changes

User Report verbatim:
> NEXT BATCH — mobile-rx-video (DR-51 + DR-52)... video is the biggest cost on phones — so phones should RECEIVE heavily-degraded video from everyone, and worst-case drop a non-speaker's video. NOTE cap5 already handles what a mobile SENDS; this is the RECEIVE side. DR-51: in full-mesh each sender has a 1:1 PC per peer, so each sender caps its OUTBOUND video toward any MOBILE remote (low maxBitrate ~80-120kbps / scale 4-6 / 8fps); audio to mobile stays full... DR-52: when a phone is STILL strained, progressively PAUSE inbound video from NON-active-speaker peers... keeping active-speaker video + ALL audio; restore as strain eases... culling/capping video must NEVER cut a peer's AUDIO.

Root Cause mechanism:
The server already stored whether a peer declared itself mobile, but presence messages did not consistently expose that server-truth flag to other clients. As a result, senders could not make per-peer sender encoding decisions for mobile receivers. The receiver auto-pause path also only reacted per remote peer and could pause the strained stream directly, rather than selecting non-active-speaker video to cull on mobile receivers.

Per-file WHY:
- `backend/src/modules/signaling/index.ts`: adds `isMobile` to peer summaries, peer joined/resumed notices, and media-state relays from the admitted server entry.
- `frontend/src/app/services/ws.service.ts`: extends signaling message types with optional `isMobile`.
- `frontend/src/app/pages/room/room.page.ts`: passes `isMobile` into WebRTC peer creation/resume/update and forwards the active-speaker frame to WebRTC policy logic.
- `frontend/src/app/services/webrtc.service.ts`: stores per-peer mobile status, unconditionally degrades video sender parameters toward mobile remotes, and adds local-mobile progressive non-speaker culling/restoration using the existing receiver-video-policy control path.
- `frontend/src/app/services/active-speaker.service.ts`: updates the debug PeerState fixture with the new `isMobile` field.
- Backend signaling tests: updated wire-format expectations and added mobile `isMobile` relay coverage.
- `e2e/tests/v3-mobile-rx-video/mobile-rx-video.spec.ts`: covers unconditional mobile receive degradation, non-active-speaker video cull, active speaker preservation, restore, and audio-active invariants.

Autonomous decisions: none. The server-truth presence route, unconditional mobile receive degrade, active-speaker-aware cull order, and composition order were operator-approved.

Caveats:
- DR-52 uses the existing sustained poor/good quality counters; no new CPU telemetry was added.
- The mobile cull restores one paused peer per sustained-good recovery event.

