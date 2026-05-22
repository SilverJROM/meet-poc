# CLEAN-P1 changes

## New
- `frontend/src/app/services/peer-state.ts` — PeerState interface (extracted from webrtc.service; pc + optional mesh fields for active-speaker compat)

## Rewritten (SFU-only)
- `frontend/src/app/pages/room/room.page.ts` — ONE media path via sfuClient; peers = computed(peerIdentities + sfuClient streams); no webrtc, no isSfuMode, no pendingSignals; admitted handler populates peerIdentities before state.set('in-call')
- `frontend/src/app/pages/room/room.page.html` — removed isSfuMode branch (single tiles-grid), removed webrtc.manualAudioOnly bindings, simplified diagnostics panel to SFU publish state

## Minor additions
- `frontend/src/app/services/sfu-client.service.ts` — added replaceAudioTrack() (parallel to replaceVideoTrack; enables audio device swap in SFU mode)

## Import-swap only (no behavior change)
- `frontend/src/app/components/participant-sidebar/participant-sidebar.component.ts`
- `frontend/src/app/components/tile/tile.component.ts`
- `frontend/src/app/services/active-speaker.service.ts`
- `frontend/src/app/services/remote-audio.service.ts`
All changed from `import { PeerState } from './webrtc.service'` → `import { PeerState } from './peer-state'`

## Deleted
- `frontend/src/app/services/webrtc.service.ts`
- `frontend/src/app/services/webrtc-diagnostics.ts`
- `frontend/src/app/services/webrtc-diagnostics.spec.ts`
- `frontend/src/app/services/webrtc-video-policy.ts`
- `frontend/src/app/services/webrtc-video-policy.spec.ts`

## Reused unchanged
All backend, sfu-client.service (except additive replaceAudioTrack), media, ice-config, ws, meeting-sessions, rooms, auth, recorder, questions, llm, active-speaker, remote-audio, viewport, platform services. All lobby/admit/chat/host/knock components.
