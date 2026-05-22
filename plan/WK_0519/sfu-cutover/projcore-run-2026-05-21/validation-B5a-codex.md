# B5a Independent Validation - Codex

Batch: B5a / SR-5 part 1 - mic/cam toggles over SFU  
Commit validated: `884755c7edf37e7ab3a2f0bc01dd976460ca665b` (`feat(sfu): mic/cam toggles over SFU + remote state reflection`)  
Branch: `feat/sfu-cutover`

## Scope Checked

- `git show 884755c` changes are limited to:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `e2e/tests/sfu-b5a-toggles/sfu-toggles.spec.ts`
  - `plan/WK_0519/sfu-cutover/projcore-run-2026-05-21/callbacks.md`
- `frontend/src/app/services/webrtc.service.ts` is unchanged by the commit.
- Current worktree has many unrelated dirty plan/screenshot artifacts, but no uncommitted diff in the checked source/test files above.

## Code Review Findings

PASS - `SfuClientService` stores SFU senders from publish transceivers:

- `audioSender` and `videoSender` fields are present.
- `doPublish()` assigns senders from `addTransceiver(...)`.
- The video transceiver is pre-negotiated even when no camera track exists.
- `destroy()` clears both sender references.

PASS - `replaceVideoTrack(track | null)` is implemented as a queued sender replacement:

- Public `replaceVideoTrack(track: MediaStreamTrack | null)` returns `this.enqueue(...)`.
- Private `doReplaceVideoTrack()` calls only `videoSender.replaceTrack(track)`.
- No createOffer/setLocalDescription/setRemoteDescription renegotiation path is introduced for camera toggles.

PASS - `RoomPage.toggleCamera()` routes camera replacement through SFU in SFU mode:

- `isSfuMode()` selects `sfuClient.replaceVideoTrack(track)` for SFU.
- Mesh mode still uses `webrtc.replaceVideoTrack(track)`.

PASS - Mic mute path remains track-enabled based:

- `toggleMic()` calls `media.toggleMic()`.
- `MediaService.toggleMic()` flips `track.enabled` and updates local mic state.
- Existing `media-state` broadcast sends the resulting mic state.

PASS - SFU peer tile state is no longer hardcoded:

- `sfuPeers` maps each SFU publisher to existing mesh/signaling peer state.
- `micEnabled` uses `meshPeer?.micEnabled ?? true`.
- `camEnabled` uses `meshPeer?.camEnabled ?? stream video-track fallback`.
- Incoming `media-state` updates still call `webrtc.updatePeer(...)`, so SFU tiles can reflect remote mute/camera state without a new wire protocol.

## E2E Validation

Command run:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b5a-val.sqlite npm test -w e2e -- tests/sfu-b5a-toggles --config=playwright.config.ts --workers=1
```

Result:

```text
1 passed (22.3s)
```

The passing test covers:

- Host and guest join in `?sfu=1` mode and reach `sfuPublishState.status === "published"`.
- Bidirectional SFU video media is established via inbound `framesDecoded > 0`.
- Guest camera off causes host inbound video `framesDecoded` delta to stay below the stop threshold.
- Guest camera on causes host inbound video `framesDecoded` delta to resume above the resume threshold.
- Guest mic mute propagates to host peer state as `micEnabled === false`.
- Both SFU publish states remain `published` after toggles.

## Mic Assertion Assessment

Using `framesDecoded` for camera validation is appropriate here because it directly observes inbound video delivery over the SFU subscription.

For mic mute, the assertion is meaningful for SR-5 part 1's remote state reflection because it verifies the host receives the guest's `media-state` update and the peer model reports `micEnabled: false`. The local mute implementation also disables the audio track via `track.enabled = false`. This does not independently prove an RTP audio packet-rate drop, but avoiding `audio packetsReceived` is reasonable with Playwright fake media because those stats are known to be unreliable in this environment.

STATUS: VALIDATED-PASS
