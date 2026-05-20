# DIAGZ Modularization Audit

## Executive Summary

DR-24 asks where "fix one section breaks another" is most likely. The answer is the live meeting surface: `room.page.ts` is the main cross-section coordinator and `webrtc.service.ts` is the main RTC state machine. Most recent DR-1..25 work is correct functionally, but the app now has several features whose blast radius crosses UI state, websocket messages, peer connection state, media tracks, recording metadata, and backend room admission rules.

The highest-risk coupling is not raw file size alone. It is the lack of explicit boundary contracts between:

- **Room lifecycle and signaling identity**: room page + websocket service + backend signaling + room/session stores.
- **Media track ownership and WebRTC sender mutation**: room page + media service + WebRTC service + recorder service.
- **Weak-connection/audio-priority behavior**: WebRTC service policy state + sender parameters + diagnostics UI.
- **Recording/session metadata**: room page + recorder service + active speaker + backend recording/questions/sessions.
- **Room access controls**: rooms API + backend signaling live room state + frontend lobby/waiting/knock states.

No sweeping refactor is recommended before JROM approves a plan. The safest next step is to add seams around these contracts, then move code behind the seams in small batches with regression tests.

## Module Map

### Backend

| Area | Files | Current boundary | Couplings |
|---|---|---|---|
| Server composition | `backend/src/server.ts` (71 LOC) | Mounts routers, initializes DB/migrations, attaches WS signaling | Knows every backend module and boot sequencing |
| Auth/session cookies | `modules/auth/index.ts` (63), `middleware.ts` (20), `sessions.ts` (38), `lib/cookies.ts` (21) | HTTP login/session validation | Used by API routers and signaling WS upgrade |
| Rooms | `modules/rooms/index.ts` (106), `store.ts` (231) | CRUD, pagination/search, slug/id resolution, open/closed room access | Calls signaling `notifyRoomAccessChanged`; store is used by signaling, recording, questions |
| Meeting sessions | `modules/sessions/index.ts` (66), `store.ts` (153) | Active/past session API and DB lifecycle | Signaling opens/closes sessions; recording upload checks open sessions; sessions API counts recordings |
| Signaling | `modules/signaling/index.ts` (723) | WebSocket live room runtime | Owns in-memory room state, pending list, closed waiters, reconnect grace, host commands, media-state relay |
| Recording | `modules/recording/index.ts` (547) | Upload/list/download/delete/transcribe endpoints and file parsing | Uses rooms/sessions ownership; triggers questions auto-analysis; exports filename parsing to questions |
| Questions/LLM | `modules/questions/index.ts` (318), `store.ts` (253), `modules/llm/*` | Prompt library, manual/auto analysis, provider abstraction | Reads recording files/transcripts; imports recording path helpers |
| ICE config | `modules/ice-config/index.ts` (121) | STUN/TURN config and Cloudflare/Metered env paths | Frontend WebRTC service depends on API shape |

### Frontend

| Area | Files | Current boundary | Couplings |
|---|---|---|---|
| Room live page | `frontend/src/app/pages/room/room.page.ts` (1493), HTML/SCSS | Orchestrates lobby, join, WS, media, WebRTC, recording, diagnostics, sidebar, mobile lifecycle | Main blast-radius file for DR-1..25 |
| WebRTC | `services/webrtc.service.ts` (928) | Peer connections, signaling payload handling, ICE restart, diagnostics, force relay, audio-only policy, sender bandwidth | Coupled to room page message order and media track replacement |
| Media | `services/media.service.ts` (347) | getUserMedia/getDisplayMedia, local stream state, device selection, mic meter, debug tracks | Coupled to room page lobby/in-call state and WebRTC sender replacement callbacks |
| WebSocket | `services/ws.service.ts` (169) | Connect/reconnect/backoff/send | Room page owns resync semantics and join payload |
| Recording | `services/recorder.service.ts` (362) | Browser audio mix, MediaRecorder, speaker metadata upload | Room page supplies participant snapshots and peer streams; active speaker drives metadata |
| Active speaker | `services/active-speaker.service.ts` (290) | RMS/inbound stats active speaker detection | Room page consumes active frame for ordering; recorder consumes it for metadata |
| Room list/access | `pages/rooms/*`, `services/rooms.service.ts` | Rooms CRUD/search/open/close/slug | Backend signaling reacts to access changes |
| Shared components | controls bar, device dialog, lobby preview, tile, participant sidebar, recording banner | Mostly presentational | Some import `PeerState` directly, coupling components to WebRTC service type shape |

## God-Object Analysis

### `room.page.ts` (1493 LOC)

Responsibilities currently combined:

1. Route/bootstrap and room slug/id resolution.
2. Lobby media preflight, device setup, mic/camera picker persistence.
3. Join prerequisite validation and join popout UX.
4. Waiting room/knock/admit/reject state.
5. WebSocket connect/reconnect join payload and all signaling message dispatch.
6. WebRTC peer orchestration and pending signal buffering.
7. Media controls: mic/camera/screen-share, mobile visibility pause, local track failure.
8. Recording start/stop/upload status and participant metadata snapshots.
9. Diagnostics toggles, force relay, manual audio-only.
10. Active speaker ordering and share strip behavior.
11. Participant sidebar commands.
12. Doorbell audio and debug hooks.
13. Lifecycle cleanup/pagehide/beforeunload.

Concrete decomposition recommendation:

- `RoomSessionCoordinator`: join/admitted/reconnect/message dispatch state, owns `RoomState`, `myId`, `hostClientId`, `reconnectToken`.
- `LobbyDeviceController`: preflight, device selection, join prerequisites, permission errors, mobile camera mode.
- `ParticipantAdmissionController`: knockers, pending-list diffing, admit/reject/remove/mute, doorbell.
- `CallMediaController`: mic/camera/screen-share toggles and local media-state broadcast.
- `RecordingController`: recording start/stop, participant snapshots, recorder notices.
- `SpeakerLayoutController`: active-speaker promotion, share strip state.
- `RoomDebugAdapter`: `window.__meetDebug` assembly so production flow stops depending on debug wiring in the page class.

### `webrtc.service.ts` (928 LOC)

Responsibilities currently combined:

1. Peer list store and `PeerState` type.
2. Peer connection creation and track setup.
3. Perfect-negotiation offer/answer glare handling.
4. ICE restart, disconnect recovery timers, selected candidate diagnostics.
5. Force-relay persistence and peer connection recreation.
6. Per-peer diagnostics computed view.
7. Weak-connection quality polling and hysteresis.
8. Receiver-video-policy control signaling.
9. Manual audio-only and auto audio-only policy.
10. Sender bandwidth/priority invariants.
11. Track replacement and fallback video pause behavior.

Concrete decomposition recommendation:

- `PeerConnectionFactory`: creates/configures RTCPeerConnection with ICE config and relay policy.
- `NegotiationManager`: offer/answer/ICE/glare/restart logic and pending restart state.
- `PeerStore`: immutable peer list mutations, diagnostics projection, peer resume/remove.
- `ConnectionQualityMonitor`: stats polling, quality classification, hysteresis counters.
- `VideoPolicyController`: manual/auto/remote video pause decisions and control payloads.
- `SenderPolicyService`: audio-priority/video-cap invariant applied after every sender mutation.
- `RtcDebugFacade`: debug snapshots and candidate logging.

## Blast-Radius Risk Ranking

| Rank | Coupling risk | Blast radius | Proposed seam/extraction | Effort | Refactor risk |
|---:|---|---|---|---|---|
| 1 | Room page owns every signaling message and directly mutates WebRTC, media, recorder, lobby, waiting-room, and UI state | Changing any WS message can break reconnect, recording, peer tiles, knockers, or lobby state | Extract `RoomSessionCoordinator` with typed event handlers and a narrow output API to page signals | L | Medium |
| 2 | WebRTC service mixes connection lifecycle, diagnostics, weak-connection policy, and sender parameters | Fixing quality/diagnostics can regress ICE restart, audio priority, force relay, or track replacement | Split `WebrtcService` internally into peer store, negotiation, quality monitor, video policy, sender policy | L | Medium-high |
| 3 | Media track replacement crosses `MediaService`, `RoomPage`, `WebrtcService`, and `RecorderService` by callbacks and shared streams | Camera/mic/device fixes can break local preview, remote senders, recording mix, DR-13 audio priority, or mobile constraints | Introduce `LocalMediaController` contract: acquired stream, selected devices, active tracks, and `onTrackReplaced` events | M | Medium |
| 4 | Backend signaling is a monolithic in-memory room runtime | Room access, reconnect, admission, mobile cap, pending list, media relay, and session closure share one `LiveRoom` structure | Extract pure state machine functions for admission/reconnect/waiting-room transitions before moving transport code | M | Medium |
| 5 | Recording metadata depends on live room page snapshots and active-speaker timing | Recording fixes can break upload, metadata, speaker segments, participant join/leave, or session IDs | Add `RecordingSessionAdapter` between room page and recorder; recorder accepts typed events instead of page snapshots | M | Low-medium |
| 6 | Room access open/close crosses rooms API and signaling side effects | Room list UI or rooms API changes can break closed-room wait promotion and doorbell/pending-list behavior | Make room access changes emit a typed backend domain event consumed by signaling | M | Medium |
| 7 | Debug/test hooks are assembled inside production page/service classes | Debug changes can accidentally touch runtime state and large page/service files | Move debug hooks to a `MeetDebugService` compiled into dev/test-safe facade | S-M | Low |
| 8 | Components import `PeerState` from `webrtc.service.ts` | Presentation components become coupled to WebRTC implementation fields | Export a smaller `ParticipantViewModel` type from a UI model file | S | Low |

## Cross-Section Coupling Notes

### Lobby and Device Setup

Current change cluster:

- `room.page.ts`: selected devices, join prerequisites, lobby state, mobile facing mode, preflight error copy.
- `media.service.ts`: constraints, stream ownership, device enumeration, mic meter.
- `device-dialog` and `lobby-preview`: selectors/preview/flip controls.
- `webrtc.service.ts`: in-call track replacement sender invariants.

Risk: device behavior is split between UI state in the page and browser API calls in `MediaService`. The page decides when `deviceId` or `facingMode` is valid; the service applies constraints. Future device work should first create a small "media target" model so both sides share one rule.

### Signaling and Reconnect

Current change cluster:

- Frontend: `WsService` reconnects transport, but `room.page.ts` owns resync/join payload, reconnect tokens, peer-resumed handling, pending signal buffers.
- Backend: `signaling/index.ts` owns reconnect tickets, grace timers, owner resume, peer-resumed, peer-left expiry, and session close.
- WebRTC: `webrtc.service.ts` marks peer reconnecting/resumed and rebuilds RTCPeerConnection.

Risk: reconnect correctness depends on matching semantics in three files. A backend message-shape change can produce ghost tiles or re-admit behavior unless room page and WebRTC service change in the same batch.

### Weak Connection and Audio Priority

Current change cluster:

- `webrtc.service.ts`: stats polling, hysteresis, sender active/cap/priority, manual audio-only, receiver video policy.
- `room.page.ts`: banner/toggle/status wiring.
- `tile`/diagnostics UI: per-peer quality display.
- `media.service.ts`: local tracks that become sender tracks.

Risk: all sender mutations must reassert DR-13. Today that invariant lives in `WebrtcService`; any future code that calls sender APIs outside it can bypass audio priority.

### Recording and Transcription

Current change cluster:

- Frontend `room.page.ts` starts/stops recording and supplies participant snapshots.
- `recorder.service.ts` mixes audio, captures active-speaker segments, uploads metadata.
- Backend `recording/index.ts` stores files, starts transcription, exposes list/download/delete.
- Backend `questions/index.ts` reads recording/transcript sidecars and auto-runs analysis.

Risk: file naming, room/session IDs, and metadata sidecars are shared implicitly across recording and question analysis. Filename parsing is exported, but transcript/analysis sidecar formatting is duplicated.

### Room Access and Slugs

Current change cluster:

- `rooms/store.ts`: slug/id resolution, open state, wait timeout.
- `rooms/index.ts`: HTTP API and `notifyRoomAccessChanged`.
- `signaling/index.ts`: closed-room waiters, promotion on open, owner bypass, pending list.
- `room.page.ts`: waiting-room/countdown/lobby/knocking transitions.

Risk: room access is split across persistent room state and in-memory live room state. Closing a room intentionally affects new joins only; opening promotes waiters. That rule should become a named backend domain operation, not an incidental API side effect.

## Prioritized Refactor Recommendations

### 1. Create a Typed Signaling Event Boundary

- Proposed seam: define shared frontend `RoomSignalEvent` handlers in a `room-signaling.coordinator.ts` and backend message type constants/tests in signaling.
- Effort: L.
- Risk: Medium.
- Benefit: Most direct reduction of "fix reconnect breaks admission/recording/tiles." Room page stops being a 1500-line switchboard.
- Suggested first guard: contract tests for `admitted`, `peer-joined`, `peer-resumed`, `peer-reconnecting`, `pending-list`, `waiting-room`, `recording-started/stopped`.

### 2. Split WebRTC Sender Policy from Peer Lifecycle

- Proposed seam: extract `SenderPolicyService` with one public method: `apply(pc)` and one invariant test suite for audio high/video capped.
- Effort: M.
- Risk: Low-medium if done first because it is mostly pure around RTCRtpSender parameters.
- Benefit: Locks DR-13 and reduces risk when changing video degrade, screen share, device switching, or track replacement.

### 3. Extract Local Media Targeting

- Proposed seam: `MediaDeviceTarget` model with `{ audioDeviceId, videoDeviceId, facingMode, mode: 'exact-device' | 'facing-mode' | 'default' }`.
- Effort: M.
- Risk: Medium.
- Benefit: Prevents future mobile/device fixes from reintroducing `deviceId` + `facingMode` conflicts.

### 4. Extract Backend Live Room State Machine

- Proposed seam: pure functions that accept `LiveRoom` + command and return state mutations/messages: `joinRoom`, `admitPeer`, `startReconnectGrace`, `promoteClosedWaiters`, `removePeer`.
- Effort: L.
- Risk: Medium-high because websocket behavior is central, but safe if pure tests are written first.
- Benefit: Makes reconnect/admission/closed-room/mobile-cap changes testable without sockets.

### 5. Add a Recording Boundary Adapter

- Proposed seam: `RecordingController` in frontend owns participant join/leave/session metadata events; `RoomPage` only calls `recordingController.start/stop`.
- Effort: M.
- Risk: Low-medium.
- Benefit: Recording changes stop touching room page peer orchestration directly.

### 6. Normalize Recording/Transcript/Analysis Sidecars

- Proposed seam: backend `recording-artifacts.ts` for filename parse, sidecar paths, transcript text formatting, analysis sidecars.
- Effort: S-M.
- Risk: Low.
- Benefit: Removes duplication between `recording/index.ts` and `questions/index.ts` and reduces delete/list/transcribe side-effect bugs.

### 7. Move Debug Hooks Out of Room Page

- Proposed seam: `MeetDebugService` that composes debug snapshots from injected services.
- Effort: S-M.
- Risk: Low.
- Benefit: Keeps test instrumentation from growing `room.page.ts` and makes e2e debug contracts easier to type.

### 8. Introduce UI View Models for Participants

- Proposed seam: `ParticipantViewModel` for tile/sidebar/strip, separate from `PeerState`.
- Effort: S.
- Risk: Low.
- Benefit: Allows WebRTC peer internals to change without touching presentational components.

## Boundary Guards

No new guard tests were added in DIAGZ. That is intentional: this batch is report-only, and even "simple" tests around live room state or WebRTC sender policy would require choosing a refactor seam first. Recommended first guards are listed above and should be added as part of approved refactor batches.

## Suggested Refactor Order

1. Extract and test `SenderPolicyService` first. It has a narrow API and protects DR-13.
2. Add typed signaling event contracts before moving room page handlers.
3. Extract backend live room pure transition tests while leaving websocket transport intact.
4. Extract local media targeting after the tests from DIAGI are green in CI/live.
5. Split room page controllers one at a time, starting with lobby devices or participant admission.
6. Normalize recording artifacts after signaling and room page churn settles.

## Acceptance Notes

- This audit does not change runtime behavior.
- No deploy is needed for DIAGZ beyond committing the report.
- The largest near-term quality win is not "make files smaller"; it is to make the invariants explicit: signaling identity, media target mode, sender priority, recording metadata, and room access transitions.

