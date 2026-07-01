# Batch R8 — Independent Validation

Validator: codex55
Batch: R8
Requirement: R8 — Backgrounds (persist+auto-apply default; custom backgrounds visible to all peers)
Verdict: PASS — REPRO-CLEARED-ON-LOCAL

## Criteria

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| R8a default persist + auto-apply on join | PASS | `RoomPage.bootstrap()` calls `restoreBackgroundFromStorage(...)` before room lookup/join flow, independent of the lazily mounted picker. The helper sets `effects.restoredFromStorage` synchronously before any `await`, so the room-page and picker constructor calls are idempotent. `restore-background-from-storage.spec.ts` proves persisted blur and builtin selections apply, mobile opt-out is respected, missing account assets clear to none, and a second restore is a no-op. |
| R8b/R8c custom backgrounds visible to all peers | PASS | Root cause is fixed in `tile.component.ts`: `resolveCamOffBackdropUrl(peer.background, peer.backgroundImageUrl)` now receives remote `backgroundImageUrl` instead of forcing remote peers to `null`. `RoomPage` stores incoming `background-image` messages as `identity.backgroundImage`, exposes that on remote `PeerState`, and re-sends the local thumbnail when peers join/resume. |
| Dedicated WS relay, not media-state piggyback | PASS | `ws.service.ts` adds a separate `background-image` message type. `RoomPage.broadcastBackgroundImage()` sends only `{ type: 'background-image', image }`, while `broadcastMediaState()` continues carrying the lightweight background descriptor. Backend signaling relays `background-image` separately after parsing the image payload. |
| Server size cap is a real boundary | PASS | Backend `parseBackgroundImage()` rejects empty, oversized, or non-`data:image/{jpeg,png,webp};base64` strings. `MAX_BACKGROUND_IMAGE_CHARS = 200_000` is enforced server-side before relay; this is independent of client thumbnail generation. Backend tests prove an oversized payload is dropped before a following valid image is relayed. |
| Render path has no script/HTML surface | PASS | Custom image data reaches Angular only through `[style.background-image]="'url(' + camOffBackdropUrl() + ')'"` in `tile.component.html`; no `innerHTML` or script-evaluating render path is introduced. |
| Cam-on virtual background regression | PASS | The R8 diff does not change `effectiveStreamForSourceTrack()`, `effectiveVideoTrackForSource()`, or `BackgroundEffectsService.processStream()`. When background processing is active and returns a processed stream, `effectiveVideoTrackForSource()` returns the processed video track and `replaceSfuVideoTrackIfChanged()` publishes that track. |
| No R1-R7 regression | PASS | `git diff -- frontend/src/app/services/sfu-client.service.ts` is empty (`wc -l` = 0). The `RoomPage` diff does not touch `shareStream`, `sharingPeer`, `remoteScreenStreams`, or screen-share layout logic; the only `screenOn` changes are existing media-state fields in the new background relay context. |
| e2e descope acceptable | PASS | The descoped 2-participant e2e is acceptable because the replacement tests prove the actual acceptance chain deterministically: backend receives and relays the thumbnail, frontend resolver returns the remote thumbnail, and the tile component renders a remote cam-off custom/account image instead of initials. This covers R8b/R8c without depending on flaky headless MediaPipe/WebRTC behavior. |

## Commands Run

```
cd frontend && timeout 25 npx tsx src/app/components/background-picker/restore-background-from-storage.spec.ts
cd frontend && timeout 25 npx tsx src/app/services/peer-state.spec.ts
cd frontend && timeout 180 npx ng test
npm test -w backend -- signaling-background-relay
git diff -- frontend/src/app/services/sfu-client.service.ts
git diff -- frontend/src/app/services/sfu-client.service.ts | wc -l
```

Results: all tests passed. `ng test` reported 1 file / 3 tests passed; backend relay reported 1 file / 4 tests passed; both plain `tsx` specs printed all assertions passed.

## Conclusion

R8a/R8b/R8c hold locally, the server-side cap is real, the custom background payload is rendered only as CSS background image, cam-on virtual background publication remains intact, and I found no R1-R7 regression in the audited scope.
