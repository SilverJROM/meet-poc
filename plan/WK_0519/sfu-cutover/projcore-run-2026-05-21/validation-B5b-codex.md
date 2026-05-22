# Validation: B5b SR-5 Part 2

Validator: Codex independent validator
Date: 2026-05-22
Commit under validation: `b61db11` (`feat(sfu): screenshare as separate published track + remote render (SR-5, B5b)`)
Note: `d544c2a` was checked and only updates `callbacks.md`.

## Scope Checked

- Reviewed `git show b61db11` for:
  - `frontend/src/app/services/sfu-client.service.ts`
  - `frontend/src/app/pages/room/room.page.ts`
  - `e2e/tests/sfu-b5b-screenshare/sfu-screenshare.spec.ts`
- Confirmed `frontend/src/app/services/webrtc.service.ts` is unchanged in `b61db11`.
- Confirmed no source edits were made during validation.

## Code Findings

- PASS: SFU screenshare publication uses a separate track path. `publishScreen()` enqueues `doPublishScreen()`, which creates a new `trackName` with kind `screen`, calls `pc.addTransceiver(displayTrack, { direction: 'sendrecv' })`, creates a fresh offer, posts `/api/sfu/tracks`, stores `screenSender`, and appends a live `kind: 'screen'` track to local publish state.
- PASS: Camera sender is not replaced or touched in the SFU screenshare path. `doReplaceVideoTrack()` remains camera-only through `videoSender`; `doPublishScreen()` uses `screenSender` and a separate transceiver.
- PASS: SFU screenshare stop closes the screen track by `mid` through `PUT /api/sfu/tracks/close` using only `screenTrack.mid`, handles Cloudflare close renegotiation when required, and marks only that screen track closed in `localPublishState`.
- PASS: `room.page.ts` routes SFU screen toggles through `toggleScreenSfu()`, which calls `sfuClient.publishScreen(track)` on start and `sfuClient.stopScreen()` on stop, then announces `sfu-publish` with only live tracks so peers see screen add/remove.
- PASS: Remote mid-call pickup is isolated to the new screen track. `handleSfuPresence()` detects `prevHadScreen=false` to `nowHasScreen=true` and calls `subscribeNewScreenTrack()`. That method filters `publisher.tracks` to `kind === 'screen'`, excludes already subscribed track names, and calls `doSubscribeTracks(publisher, newTracks)`, so existing camera/audio tracks are not re-subscribed or duplicated.
- PASS: `ontrack` routes `entry.kind === 'screen'` into `remoteScreenStreams`; non-screen tracks continue into `remoteStreams`.
- PASS: Screen removal cleanup is present. `tearDownScreenSubscription()` removes the peer from `remoteScreenStreams`, removes only subscribed entries where `entry.kind === 'screen'`, deletes those mids from `midToEntry`, and closes only those mids.
- PASS: Mesh `webrtc.service.ts` has no changes in `b61db11`.

## E2E Evidence

Command run from repo root:

```bash
E2E_BACKEND_PORT=4822 E2E_FRONTEND_PORT=4823 E2E_PROXY_PORT=4821 E2E_BASE_URL=http://localhost:4821 E2E_WS_ORIGIN=ws://localhost:4821 MEET_DB_PATH=/tmp/meet-sfu-b5b-val.sqlite npm test -w e2e -- tests/sfu-b5b-screenshare --config=playwright.config.ts --workers=1
```

Result:

```text
✓ 1 [chromium] › tests/sfu-b5b-screenshare/sfu-screenshare.spec.ts:71:1 › B5b: screenshare publishes a separate video track over SFU; remote sees it; stop removes it; camera unaffected (2-client SFU) (19.8s)
1 passed (31.1s)
```

The test confirms B receives `remoteScreenStreams.size === 1` after A starts sharing, B's screen stream count returns to `0` after A stops sharing, and B's inbound video `framesDecoded` continues advancing while/after A shares so A's camera path remains active.

STATUS: VALIDATED-PASS
