# Batch FIXC2 — Pre-join device-test modal + in-call device dialog

**Persona:** Codex builder, `-s danger-full-access`. FIXC1 PASSED independent validation; you are cleared for FIXC2. **COMMIT BEFORE STATUS: DONE.**

## Scope: requirements R-C-1 and R-C-2

JROM verbatim:
> "lets have a mini modal test screen where user can test their camera, mic and speakers, and make the allow mic/camera much nicer ui rather that the ugly one showing right now, how does this work on other meeting software like zoom/meet/etc copy that"
> "yes have the users able to test out their device settings before entering, and also even in the middle of the call, have a ... or setting icon where they can still change their device settings or test it."

Spec rows:
- **R-C-1** Pre-join device-test modal: camera preview tile + mic VU meter + speaker test tone + device dropdowns for cam/mic/speakers, replacing the raw browser permission UX with a styled custom overlay BEFORE the browser prompt. Meet/Zoom green-room pattern.
- **R-C-2** In-call device dialog: gear/`...` icon in controls-bar opens the same dialog. Switching device mid-call hot-swaps the published track via `RTCRtpSender.replaceTrack()` without dropping the connection.

## Branch

```
git checkout -b fix/meet-fixc2-device-modal fix/meet-fixc1-camera-light
```

## Implementation (your discussion-phase plan)

### Pre-join modal (R-C-1)

1. **Insertion point:** the lobby/preflight step BEFORE the existing "Join" button on the room page. Current entry flow is `/room/:id` → display name + "Start with camera on" checkbox → Join. Insert the green-room dialog BEFORE the Join action, as a step that runs `getUserMedia` against the lobby preview stream.
2. **Route alias:** add `/join/:id` as an alias to `RoomPage` in `app.routes.ts` per the discussion-phase decision (alias only; do not rewrite existing `/room/:id` links).
3. **Custom permission overlay:** styled card explaining "Click Allow when your browser asks for camera and mic." Shown BEFORE the first `getUserMedia()` call. Once the user clicks "Continue", we fire `getUserMedia` and the OS-level prompt appears on top — the overlay then shows the device list.
4. **Camera preview tile:** a mirrored `<video>` element bound to the lobby stream.
5. **Mic VU meter:** AudioContext + AnalyserNode + getByteFrequencyData; render RMS as an animated horizontal bar.
6. **Speaker test:** "Test speaker" button → WebAudio OscillatorNode @ 440 Hz, 1 second, gain 0.2. No external `.mp3` asset.
7. **Device dropdowns:** `enumerateDevices()` filtered by `kind === 'videoinput' / 'audioinput' / 'audiooutput'`. The audio-output dropdown's `setSinkId` integration depends on Chrome support; degrade gracefully if unavailable (show dropdown disabled with tooltip).
8. **Persistence:** chosen device IDs stored in localStorage and applied to subsequent room joins.
9. **Style:** soft-light theme (matches the rest of the app). Reuse existing CSS variables.

### In-call dialog (R-C-2)

1. **Trigger:** gear icon in `controls-bar.component`. Adjacent to the existing controls (mute/cam/share/leave).
2. **Reused component:** the SAME device-dialog component used in the lobby. Mode prop distinguishes pre-join vs in-call.
3. **Hot-swap implementation:** when user picks a new camera, call `media.service.replaceVideoTrack()`. For each peer connection in `webrtc.service.peers()`, find the video sender via `pc.getSenders().find(s => s.track?.kind === 'video')` and call `sender.replaceTrack(newTrack)`. Same pattern for mic via `audio` sender. Stop the OLD track AFTER the replace lands (per FIXC1's stop discipline).
4. **No renegotiation needed:** `replaceTrack()` does not require SDP offer/answer round-trip. Confirm in test that the peer-connection state stays `connected` after swap.
5. **Speaker swap:** `setSinkId` on every `<video>` element bound to a remote stream + the local preview if applicable.

### Files (your outline)

- New: `frontend/src/app/components/device-dialog/device-dialog.component.{ts,html,scss}` (or whichever component-folder convention you prefer)
- `frontend/src/app/services/media.service.ts` — add `replaceVideoTrack(deviceId)`, `replaceAudioTrack(deviceId)`, lobby-preview lifecycle, device-list cache
- `frontend/src/app/services/webrtc.service.ts` — add `replaceLocalSenderTrack(kind, newTrack)` that walks all peers and calls `sender.replaceTrack` (de-duped via Set, mirroring `stopLocalSenderTracks` from FIXC1)
- `frontend/src/app/pages/room/room.page.{ts,html,scss}` — insert lobby device-dialog step; pass mode='lobby'
- `frontend/src/app/components/controls-bar/controls-bar.component.{ts,html,scss}` — add gear icon; emit `openDevices` event handled by room page; pass mode='in-call'
- `frontend/src/app/app.routes.ts` — add `/join/:id` alias
- New: `e2e/tests/v3-fixc2-device-modal/*.spec.ts`

### Test plan (Playwright)

1. **FIXC2.1 — pre-join modal renders.** Visit `/room/:id`, assert custom permission overlay appears BEFORE the browser prompt, assert "Continue" button.
2. **FIXC2.2 — preview stream lights up.** After "Continue" + fake-device autopermit, assert preview `<video>` has `videoWidth > 0`, mic VU bar updates (we can't measure visual animation but we can assert AnalyserNode is wired by exposing a debug hook).
3. **FIXC2.3 — speaker test plays beep.** Assert OscillatorNode is created on button click (debug hook).
4. **FIXC2.4 — device selection persists.** Pick a camera from dropdown, hit Join, leave, re-enter; assert dropdown defaults to the previously-picked device.
5. **FIXC2.5 — in-call gear opens dialog.** Join, click gear icon, assert dialog opens in `in-call` mode.
6. **FIXC2.6 — mic swap preserves peer connection.** Join with 2 peers, host swaps mic in dialog. Assert `pc.connectionState === 'connected'` on both peers after swap. Assert the local sender's track changed (track.id differs from pre-swap).

Use `createRoomViaApi` for room creation (auto-cleanup).

## Gotchas codex flagged

- **Browser permission prompt cannot be suppressed.** Our overlay just *prepares* the user; we cannot replace the OS-level dialog. Document this in `changes.md` if anyone asks.
- **`setSinkId` is Chrome-specific.** Firefox returns undefined. Degrade gracefully (disabled dropdown + tooltip "audio output device switching requires Chrome").
- **Lobby preview stream must NOT collide with the eventual join stream.** When user clicks Join, stop the preview stream tracks BEFORE the room-join code requests new tracks. Or: pass the preview stream through to the room — pick whichever approach is cleaner.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc2/`

1. `changes.md`
2. `scenarios-implemented.md`
3. `test-report.md`
4. `review.md`
5. `independent-validation.md` (placeholder)
6. `screenshots/lobby-modal.png` (lobby step with preview)
7. `screenshots/in-call-dialog.png` (mid-call dialog)

## Build + deploy

- Backend build PASS (no backend changes expected)
- Frontend build PASS
- `pm2 restart meet-poc-fe`
- Live URL `https://voice.silverjrom.app/` smoke: open a room, see lobby modal, join, open gear icon

## Validation gates (your self-checks)

- [ ] Tree clean before STATUS: DONE
- [ ] `npm test -w backend` PASS (59/59)
- [ ] `npm test -w e2e -- tests/v3-fixc2-device-modal --config=playwright.live.config.ts --workers=1` PASS
- [ ] Run 1 regression PASS (the 49-spec set used in FIXC1) — must hold; this is R8.1's 12th consecutive batch
- [ ] Two screenshots captured

## Completion

End with the STATUS: DONE block in FIXC1's format. I will validate independently before dispatching FIXC3.
