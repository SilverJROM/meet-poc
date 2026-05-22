## Accepted through B2 — feat/sfu-cutover
HEAD: 97900bd
Done: B0 (cap 30, 0dacde5) | B1 (backend CF proxy /api/sfu/*, 59c0122, real CF creds work) | B2 (frontend SFU publish + op queue, 97900bd, real-publish e2e passes).
Key facts for next batches:
- SfuClientService (frontend/src/app/services/sfu-client.service.ts): one PC to CF, ICE=CF STUN+TURN fallback, pre-negotiated video transceiver, enqueue() op-queue (REUSE for subscribe/close/update/renegotiate), localPublishState signal {cfSessionId, tracks[{trackName,kind,mid,status}]}, __meetDebug.sfuGetStats/sfuPublishState test hooks, wired behind ?sfu=1 in room.page admitted handler (mesh default otherwise).
- Backend /api/sfu/* (realtime-sfu module): session/tracks/tracks-update/renegotiate/tracks-close/get; needs {clientKey,participantId,sessionId} body for authz; ownership map; CF response may include requiresImmediateRenegotiation + offer (B4 handles).
- ws admitted message carries clientId/participantId/sessionId/clientKey.
Next: B3 — signaling presence (broadcast each participant's cfSessionId + trackNames + roster revision) so peers can discover each other to subscribe in B4.

## + B3 (66ab520) DONE+VERIFIED
- ws messages: client->server `sfu-publish {cfSessionId, tracks:[{trackName,kind}]}`; server->clients `sfu-presence {clientId,participantId,cfSessionId,tracks,revision}` + `sfu-roster {publishers[]}` (full snapshot on admit). Monotonic room-wide revision; presence cleaned on leave/disconnect/expire/meeting-ended.
- frontend SfuClientService: `remotePublishers` signal (Map clientId->{participantId,cfSessionId,tracks,revision}), handleSfuPresence (stale-reject older-or-equal), handleSfuRoster (replace), removePeer. room.page sends sfu-publish after publish (behind ?sfu=1), routes sfu-presence/sfu-roster/peer-left to the sfuClient.
- Next: B4a — subscribe to ONE remote publisher from remotePublishers via /api/sfu/tracks location:remote, handle CF renegotiation (offer->answer->/api/sfu/renegotiate) THROUGH the enqueue() op queue, render tile via ontrack. Acceptance e2e: 2 clients each see+hear the other through CF (framesDecoded>0).

## + B4a (a9ab284) DONE+VERIFIED — CORE PROOF
- SfuClientService: subscribeIfNeeded(publisher) (skip self/double) → enqueue(doSubscribe): POST /api/sfu/tracks location:remote → CF offer → setRemoteDescription → createAnswer → setLocalDescription → PUT /api/sfu/renegotiate, all in ONE enqueue op. ontrack maps event.transceiver.mid → midToEntry → per-publisher MediaStream in remoteStreams signal. subscribedTracks (mid→entry), subscribedClientIds guard, callerCreds stored.
- room.page: isSfuMode signal, sfuPeers computed (remote tiles from remoteStreams), subscription effect gated on localPublishState.status==='published' (race fix), html isSfuMode gate on tiles-grid. __meetDebug.sfuRemoteStreams.
- PROVEN: 2 clients each receive other's audio+video through CF.
- Next: B4b — late join (subscribe to ALL present), live new-publisher pickup, unsubscribe on remote leave (roster-revision driven), tile removal. Then B5a/B5b toggles+screenshare.

## + B4b (afb0441) DONE+VERIFIED — SR-4 COMPLETE
- SfuClientService: tearDownPeerSubscription(clientId) — collect mids for publisher, delete from subscribedTracks/midToEntry/remoteStreams/subscribedClientIds, enqueue doClose(PUT /api/sfu/tracks/close by mid). removePeer calls teardown BEFORE roster update. Late-join + live-pickup handled by B4a's roster-iterating effect (unchanged).
- WATCH-ITEM: late-subscribe latency (publish→remote ontrack) measured 30-60s in headless 3-client e2e. Likely test/headless+CF artifact but MUST be measured in B9 diagnostics + confirmed acceptable in B10/field for 3+ calls.
- Next: B5a — mic/cam toggle over SFU (replaceTrack on stored sender / track.enabled + announce via sfu-publish update), host mute/remove/end trigger SFU close + roster withdrawal. Then B5b screenshare-as-separate-track.

## + B5a (884755c) DONE+VERIFIED — SR-5 part 1
- SfuClientService.replaceVideoTrack(track|null): enqueued videoSender.replaceTrack, NO renegotiation (pre-negotiated sender). audioSender/videoSender stored in doPublish, cleared in destroy. Mic = media.toggleMic track.enabled. room.page toggleCamera routes by isSfuMode. sfuPeers reads micEnabled/camEnabled from mesh peer state (media-state ws driven).
- Next: B5b — screenshare as a SEPARATE published video track (NOT replacing camera): add a new screen video track → it's a NEW sender after initial negotiation, so it needs a publish-style /api/sfu/tracks(local)+renegotiation THROUGH enqueue (different from B5a's no-reneg replaceTrack); announce via sfu-publish (new trackName, kind screen); on stop, close-by-mid + announce removal. Remote renders screen as its own tile/region.

## + B5b (b61db11) DONE+VERIFIED — SR-5 COMPLETE
- SfuClientService: publishScreen/stopScreen (doPublishScreen = addTransceiver(screen)→/api/sfu/tracks local→reneg via enqueue, separate screenSender; doStopScreen = close-by-mid). remoteScreenStreams signal. subscribeNewScreenTrack = mid-call partial subscribe for an already-subscribed peer's NEW screen track (does NOT re-subscribe existing). ontrack routes kind=screen → remoteScreenStreams. tearDownScreenSubscription on sfu-presence removal. announceSfuPublishState helper.
- room.page: toggleScreenSfu, sharingPeer/shareStream/anyScreenShareActive/sfuPeers all SFU-aware.
- Next: B6a — publisher simulcast: publish camera video with multiple RID sendEncodings (e.g. h/m/l with scaleResolutionDownBy) in doPublish's addTransceiver. Test: published video SDP has multiple RIDs / outbound-rtp shows multiple layers. (B6b = subscriber preferredRid/priorityOrdering/ridNotAvailable via /api/sfu/tracks/update.)

## + B6a (5524097) DONE+VERIFIED — SR-6 part 1
- VIDEO_SIMULCAST_ENCODINGS = [{rid:'h',scale1,1.2M},{rid:'m',scale2,400k},{rid:'l',scale4,120k}] set in BOTH doPublish camera addTransceiver paths (sendEncodings). getVideoEncodings()/sfuVideoEncodings debug hook. Screenshare single-encoding. Chromium auto-emits a=simulcast:send h;m;l. CF accepts.
- Next: B6b — subscriber layer preference: when subscribing to a remote publisher's camera (location:remote), include simulcast layer prefs (preferredRid + priorityOrdering + ridNotAvailable) and/or use PUT /api/sfu/tracks/update to switch layer; pick LOW for mobile receivers (isMobile) / small tiles, HIGH for desktop; screenshare prioritized. Verify the chosen rid via the tracks/update response or stats.

## + B6b (40b1782) DONE+VERIFIED (iter3) — SR-6 COMPLETE
- Subscriber layer pref: preferredCameraRid (mobile→'l' via ViewportService, desktop→'h'), cameraRidNow screenshare-override→'l', isAnyScreenActive. preferredRid+priorityOrdering+ridNotAvailable:'degrade' on camera tracks in doSubscribeTracks POST. updateCameraLayer()→enqueue doUpdateCameraLayer (PUT /api/sfu/tracks/update for camera mids). room.page effect on anyScreenShareActive.
- IMPORTANT NEW HELPER: sfu-mid-reconcile.ts reconcileSubscribedMids(responseTracks, newTransceiverMids, kindMap, publisherClientId) — CF returns mid:"" in subscribe RESPONSE; real mids come from negotiated SDP transceivers. Reconcile POSITIONALLY (responseTracks[i]↔newTransceiverMids[i]), store midToEntry/subscribedTracks only under REAL mids. Used by doSubscribe. Any future subscribe work MUST use this (don't reintroduce rt.mid keying).
- WATCH: layer-pref e2e occasionally needs a rerun (PUT-update capture timing). 
- Next: B7 — reconnect/leave/teardown over SFU: drop→reattach (new CF session, retain DR-37/38/39 identity/token, re-publish+re-subscribe, no ghost tiles, CF 30s GC); deliberate exit closes tracks-by-mid + PC + removes card. ALSO measure/address the late-subscribe latency watch-item from B4b where feasible.

## + B7 (aabe71c) DONE+VERIFIED — SR-7 COMPLETE (3 fix iters)
- Drop→reconnect: resetForReconnect() (clears PC+subscriber state) BEFORE admitted addPeer loop; peer-resumed→removePeer(oldClientId) ghost-free; re-publish new cfSession; A re-subscribes to B-new. KEY: CF returns not_found_track_error when subscribing to a freshly-republished session before tracks propagate → doSubscribeTracks scans response tracks for errorCode + THROWS → subscribeIfNeeded.catch clears guard + bumps subscribeRetryVersion → effect retries. BOUNDED: SUBSCRIBE_RETRY_CAP=7, exp backoff 250ms→4s, per-publisher counter, reset on success/new-cfSession/teardown/reconnect/destroy.
- Deliberate exit: closeLiveTracksForExit() closes SFU PC + tracks (idempotent; snapshots creds/state so the close PUT body is valid even after clearing); ngOnDestroy calls cleanupCall before destroy.
- doClose: try/catch (CF 400 for remote-subscriber closes ignored, auto-GC) + requiresImmediateRenegotiation handling.
- Next: B9 — SFU diagnostics: adapt DR-54 to SFU (one PC; publish outbound-rtp + per-remote-track inbound-rtp stats; CF edge/candidate; audio jitter-buffer; simulcast layer in use; the subscribe→ontrack LATENCY watch-item from B4b/B7). RETAIN DR-41 two-sided server-side logging so projcore can pull forensics on JROM field-test calls. Then B8 (retire mesh), B10 (full validation+field).

## + B9 (920ce49) DONE+VERIFIED — SR-9 COMPLETE
- SfuClientService.collectDiagnostics() → SfuDiagnosticsSnapshot (outbound-rtp per layer; inbound-rtp per remote track via mid→midToEntry; candidate-pair RTT/local+remote candidate type; subscribe-latency recorded at doSubscribeTracks reconciliation). DiagnosticsPayload.sfuDiagnostics? additive (no schema change). room.page appendDiagnosticsLog awaits collectDiagnostics in ?sfu=1. Persisted via existing /api/meeting-sessions/:id/diagnostics → meeting_session_diagnostics. backend summarizeDiagnosticsPayload reads sfuDiagnostics for candidate/relay/peerCount. diagnostics.page SFU section.
- Next: B8 — RETIRE MESH. Remove mesh PC fan-out, per-peer glare, per-peer PC-recreate, mesh degrade (DR-42/F3), DR-31 mesh dedup, mesh signal relay, AND make SFU the only path (remove the ?sfu=1 gate → SFU always). KEEP/ADAPT: operation serialization, DR-40 single-PC recovery (ICE-restart/media-dead/fresh-ICE for the client↔CF PC), identity dedup/no-ghost, admit/identity/reconnect (DR-37/38/39), chat(ws), host controls, diagnostics(SR-9), device hot-unplug recovery(DR-46), iOS audio(DR-45 bind to SFU ontrack), ICE=CF STUN+TURN fallback. CAREFUL DIFF — biggest deletion batch. Then B10 full validation + JROM field test.
