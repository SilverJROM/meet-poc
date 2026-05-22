# SFU Cutover Plan Review — Codex

## Overall Verdict
REVISE before dispatch. The plan is directionally sound for Cloudflare Realtime SFU, but several API and sequencing details need tightening before B1/B2/B4/B6/B8 are safe to hand to the implementer.

Primary grounding: local `og-requirements.md`, `implementation-plan.md`, current `webrtc.service.ts`, signaling and ICE modules, plus Cloudflare Realtime docs/OpenAPI:
- https://developers.cloudflare.com/realtime/sfu/https-api/
- https://developers.cloudflare.com/realtime/static/realtime-api-2024-05-21.yaml
- https://developers.cloudflare.com/realtime/sfu/limits/
- https://developers.cloudflare.com/realtime/sfu/simulcast/
- https://developers.cloudflare.com/realtime/sfu/pricing/

## 1. API Correctness
Verdict: mostly correct, with MUST-FIX gaps.

Correct:
- Base API shape is right: `POST /apps/{appId}/sessions/new`, `POST /sessions/{sessionId}/tracks/new`, `PUT /sessions/{sessionId}/renegotiate`, `PUT /sessions/{sessionId}/tracks/close`, `GET /sessions/{sessionId}`.
- Session equals one RTCPeerConnection and Cloudflare has no room/presence protocol; app signaling must distribute session and track IDs.
- Publish flow is correct when using a browser-created offer for local tracks: client offer -> `/tracks/new` -> Cloudflare answer -> `setRemoteDescription(answer)`.
- Subscribe flow is correct: remote `/tracks/new` can return `requiresImmediateRenegotiation: true` and an offer; client sets remote offer, creates answer, then sends answer to `/renegotiate`.

Corrections:
- B1/SR-1 must include `PUT /sessions/{sessionId}/tracks/update`. It is required for simulcast layer preference changes and transceiver reuse; B6 cannot be implemented cleanly with only `tracks/new`.
- B7 should not say "close session" unless the implementer has found a separate supported endpoint. The Realtime connection API exposes close tracks/datachannels, not a session-close endpoint. Teardown should close local/remote tracks by `mid`, close the RTCPeerConnection, and let inactivity cleanup handle the session.
- Close tracks is `mid`-based, not `trackName`-based. If `force:false`, it may include an offer/answer-style `sessionDescription`; if `force:true`, it stops data flow without WebRTC renegotiation. Plan B5/B7/B8 should state how mids are persisted for close.
- Simulcast field name must be `ridNotAvailable`. The OpenAPI examples contain typos in examples, but the schema and docs use `ridNotAvailable`.
- Track naming needs a concrete scheme. Cloudflare `trackName` is app-provided for local push and is globally addressable inside the app; collisions across reconnects/screenshares would be bad. Use deterministic, unique names such as `{participantId}:{epochSessionCounter}:{kind}:{uuid}` or generated UUIDs carried in signaling, and never assume kind alone is unique.
- DataChannel is not needed for existing chat if ws remains authoritative. If used later, Cloudflare datachannels are unidirectional and require dedicated `/datachannels/*` flow; do not accidentally move chat into SFU DataChannels in this cutover.
- Limits need to be in the plan: 50 API calls/sec/session, 64 tracks per API call, no hard tracks-per-session limit, 30s inactive track GC, and operations wait for PC `connected` up to 5s. These affect join storms, reconnect, and publish/subscribe timing.

## 2. Decomposition + Order
Verdict: good skeleton, but B1, B4, B6, and B8 need refinement.

- B1 is too thin unless it includes all SFU primitives needed later: `tracks/update`, close-by-mid, error passthrough, admitted-member authz scoped to room/session ownership, and test doubles for Cloudflare errors. A real-session smoke test is fine, but should not be the only test.
- B2 before B3/B4 is OK for local publish proof, but B2 must also establish the single negotiation queue abstraction. Publishing, subscribing, close, layer update, and reconnect all mutate the same PC; letting B4 invent the queue later invites races.
- B3 is atomic and correctly before B4, but should include explicit roster revision/update semantics so late/out-of-order track announcements do not subscribe stale tracks.
- B4 is probably not <30 minutes if it includes remote track API, renegotiation, ontrack tile binding, late join, and live new-publisher updates. Split into B4a "single remote subscribe/render with serialized negotiation" and B4b "late join/live publisher updates + unsubscribe on remote leave" unless the implementer already has a proven SFU client pattern.
- B5 is acceptable after B4, but screenshare should likely be separate from basic mic/cam toggles if strict atomicity matters. Screenshare introduces a second local video track and close/reannounce behavior.
- B6 should be two slices: publisher simulcast SDP/sendEncodings, then subscriber layer preference/update behavior. The latter depends on `/tracks/update` and on a tested roster/track-mid model.
- B7 is correctly after publish/subscribe/toggles, but it needs explicit interaction with the existing DR-37/38/39 reconnect token semantics and the 30s CF track inactivity timeout.
- B8 should not run before B9 diagnostics. Keeping mesh diagnostics until SFU diagnostics are in place gives safer evidence while deleting old recovery code. Recommended order: B1, B2, B3, B4a, B4b, B5a, B5b, B6a, B6b, B7, B9, B8, B10.

## 3. Missing Requirements/Risks
Verdict: several MUST-FIX risks.

- ICE config: the plan says keep TURN "as CF ICE servers", but Cloudflare docs say Realtime generally does not need TURN and recommends Cloudflare STUN (`stun.cloudflare.com:3478`) while TURN can still help restrictive clients. Plan should explicitly define client-to-CF RTCConfiguration: use Cloudflare STUN plus existing TURN fallback; keep force-relay diagnostics only if it still works against CF.
- Renegotiation races: must serialize all PC-affecting operations behind a single queue/lock. Concurrent publish, subscribe, close, and layer update can otherwise collide with `stable`/`have-remote-offer` transitions.
- Track/mid persistence: the app must store `{publisherClientId, publisherParticipantId, publisherCfSessionId, trackName, kind, mid, status, revision}`. `mid` is needed for close/update on the local subscriber session.
- Simulcast: Cloudflare supports publisher SDP RIDs and subscriber `simulcast` preferences on pull/update. The plan should not imply guaranteed manual device-quality enforcement unless B6 uses `preferredRid`, `priorityOrdering`, and `ridNotAvailable` correctly and tests the selected layer via stats/API response.
- Screenshare: should be a separate published video track, not a replacement for camera, because camera and share have different lifecycle, priority, and tile mapping. "Replace camera sender" is acceptable for camera toggle, not for screenshare.
- Participant cap: current signaling has `MAX_ADMITTED=5` and mobile cap 4. Removing only mesh cap in B8 is late; to prove 3+ and >5, an earlier batch must raise/remove the server cap under the SFU feature branch with an explicit product cap or CF/billing guard.
- Security: `/api/sfu/*` must enforce room membership and ownership of mutable resources. A participant must not be able to close/update another participant's local tracks or subscribe to sessions outside the admitted room.
- Cost: "deferred" cost monitoring is a risk for field testing. At minimum add a B10 validation note to record expected egress exposure; Cloudflare bills SFU/TURN egress at published GB rates after free tier and only CF-to-client SFU traffic is charged.

## 4. Mesh Teardown (B8) Risk
Verdict: retire mesh topology, but preserve/adapt several hardening concepts.

- DR-40 should not be deleted wholesale. Per-peer mesh PC recreate is obsolete, but single client-to-CF PC ICE restart/recreate, connection-state recovery, media-dead detection, and fresh ICE config remain relevant under SFU.
- TURN/ICE config is still relevant for the client-to-CF leg, but the plan should say Cloudflare STUN first plus TURN fallback, not imply our existing TURN is automatically "CF ICE".
- Perfect-negotiation glare between app peers is obsolete, but local operation serialization is still required because Cloudflare may produce offers for subscribe/close while the client is also publishing or updating tracks.
- DR-31 peer dedup in mesh form can go, but participant identity dedup/no-ghost reconciliation must stay because reconnect creates new CF sessions and new track names.
- DR-42/F3 per-peer mesh sender degrade/pause should be retired, but the user-facing policy intent remains and should become SFU simulcast/layer preference plus screenshare/camera prioritization.
- Diagnostics should not be deleted with mesh code. Keep the two-sided logging pipeline and adapt candidate/connection/rtp stats to one SFU PC and per-track inbound/outbound stats.

## 5. Mapping Existing Features
Verdict: maps cleanly if signaling remains the source of truth, with a few conflicts to resolve.

- Admit/waiting-room/identity/reconnect map cleanly. Signaling should continue to admit participants before SFU session creation or before publishing/subscribing is allowed.
- Reconnect needs a clear "old CF session retired, new CF session announced" flow. Existing durable participant identity can stay, but SFU roster updates must invalidate old tracks quickly to avoid ghost subscriptions.
- Chat maps cleanly over ws; do not move it to SFU DataChannels in this cutover.
- Host controls map cleanly for remove/end/mute as ws commands, but remove/end must also trigger SFU track close/local PC cleanup and roster withdrawal.
- Diagnostics map well, but B9 should precede B8 so validators have SFU evidence before old mesh diagnostics disappear.
- Device hot-unplug and iOS audio unlock/mixer should stay. The remote-audio path must bind to SFU `ontrack` streams the same way it currently binds to mesh remote streams.

## Prioritized Plan Changes
MUST-FIX:
- Add `/tracks/update` to SR-1/B1 and make B6 depend on it.
- Replace "close session" language with supported close-track/PC-close/session-timeout behavior.
- Define unique trackName scheme and persist mids for close/update.
- Add a single SFU negotiation/operation queue in B2 and make B4/B5/B6/B7 use it.
- Split B4 and B6, and likely split B5 screenshare from basic toggles.
- Move SFU diagnostics before mesh teardown, or at least make B8 dependent on B9-level evidence.
- Preserve/adapt DR-40 recovery for the single client-to-CF PC.
- Clarify ICE config: Cloudflare STUN plus existing TURN fallback, not mesh peer ICE assumptions.
- Remove/raise `MAX_ADMITTED`/mobile cap before the >5 validation path.
- Harden `/api/sfu/*` authorization by room membership and resource ownership.

NICE-TO-HAVE:
- Add explicit cost note to B10 for CF-to-client egress during field testing.
- Add a roster revision number to prevent stale subscribe/unsubscribe.
- Add a B1 Cloudflare error contract test using mocked 4xx/5xx responses.
- Add an explicit "no SFU DataChannel for chat in this cutover" guard.

STATUS: REVIEW-DONE — REVISE before implementation; the cutover plan is viable after API/update, negotiation-queue, teardown, and ordering fixes.
