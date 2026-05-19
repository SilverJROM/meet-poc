# Batch FIXC1 — Camera-light bug fix

**Persona:** Run as the codex builder. You have `-s danger-full-access`. Pattern 2 (tmux watch). Discussion-phase output accepted by projcore — your per-batch outline is the agreed plan.

**COMMIT BEFORE STATUS: DONE.** Past sessions broke this rule on M-B6, FIX-B3, FIX-B2. FIX-B1 + FIX-B4 held it cleanly. Match the FIX-B4 pattern.

## Scope: requirement R-C-3 ONLY

Brief verbatim:
> **R-C-3 — Camera-light bug fix.** On leave (Leave button, browser close, tab close), every local MediaStreamTrack (camera + mic + screen-share) `.stop()` fires before peer-connection teardown.

JROM verbatim quote (preserved in og-requirements.md):
> "2nd when i joined the call my camera lights on, but after leaving the call its still lights-on can you fix that"

## Branch

Base off the current `fix/meet-fixb4-transcripts` branch (carries the fixb work forward). Create `fix/meet-fixc1-camera-light`.

```
git checkout -b fix/meet-fixc1-camera-light fix/meet-fixb4-transcripts
```

The `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/` folder is currently untracked. **Commit it as your first commit** (`docs: seed projcore run C`).

## Implementation (your discussion-phase plan)

> Files: frontend/src/app/services/media.service.ts, frontend/src/app/pages/room/room.page.ts, frontend/src/app/services/webrtc.service.ts, new e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts.
> Approach: make local cleanup idempotent, stop camera/mic/screen tracks before connection teardown, add pagehide/beforeunload cleanup for tab close.
> Gotcha: browser-close proof needs instrumented Playwright track-stop counting; JROM hardware LED is still final proof.
> Tests: Playwright join/leave/live-track assertion. Backend: none.
> Commits: 1 (code) + 1 (docs seed) + 1 (test) = up to 3.

### Specific requirements

1. **Local-cleanup idempotency.** The leave path must be safe to call N times without throwing. Iterate every local `MediaStreamTrack` in `media.service.ts` (and any extra tracks on screen-share senders in `webrtc.service.ts`) and call `track.stop()` before peer-connection close. After stop, set the track refs to null so a second call is a no-op.
2. **Track-stop ordering.** `.stop()` MUST happen BEFORE `RTCPeerConnection.close()`. Currently the leave path closes the peer first which can keep the track in a "live" state inside the senders.
3. **Page lifecycle hooks.** Wire `pagehide` (preferred) and `beforeunload` to call the same leave-cleanup path. `pagehide` fires for cross-document navigation + tab close + bfcache; `beforeunload` is the legacy fallback. Use `addEventListener` in the room page; remove on `ngOnDestroy`.
4. **Screen-share tracks.** If a local screen-share is active, that track lives outside the camera/mic media-service tracks (on a dedicated sender). Make sure your cleanup walks ALL local senders and stops their tracks regardless of source.
5. **No regression to in-call mute/disable.** Muting (audio-off, video-off mid-call) MUST NOT call `track.stop()` — only `track.enabled = false`. Stop is for leave only. Read the existing controls-bar mute handler to confirm you're not double-treating it.

### Playwright test plan

New file `e2e/tests/v3-fixc1-camera-light/camera-light.spec.ts` with at least these scenarios:

1. **Join + leave: no live tracks remain.**
   - Use `--use-fake-device-for-media-stream` (already in config).
   - Join room as host, assert at least one `getUserMedia`-tracked stream is live.
   - Click Leave.
   - Wait for room teardown, then poll `navigator.mediaDevices.enumerateDevices()` is insufficient (that's a permission check, not a track state). INSTEAD instrument the window with a helper:
     ```ts
     await page.exposeFunction('__getLiveTrackCount', () => {
       const tracks = (window as any).__activeTracks || [];
       return tracks.filter((t: MediaStreamTrack) => t.readyState === 'live').length;
     });
     ```
     Hook the media-service to register tracks in `window.__activeTracks` (debug-only build flag is fine; or just wire it always in dev — gate on `env.NODE_ENV !== 'production'`).
     Assert count drops to 0 after leave.
2. **pagehide handler stops tracks.** Programmatically dispatch a `pagehide` event and assert live-track count → 0.
3. **Idempotency.** Call the leave handler twice; second call must not throw.
4. **Mute does not stop tracks.** Toggle mute mid-call, assert track stays in `live` state (just `enabled=false`).

Use `createRoomViaApi` from `e2e/fixtures/rooms.ts` so the global-teardown auto-cleans.

## Required artifacts at `plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc/batch-fixc1/`

1. `changes.md` (verbatim JROM quote + scope + file inventory + commits)
2. `scenarios-implemented.md`
3. `test-report.md` (backend full suite + new e2e spec + Run 1 desktop regression)
4. `review.md`
5. `independent-validation.md` (placeholder — projcore fills in)
6. `screenshots/` empty for this batch (no UI changes — camera LED is hardware-only proof, JROM verifies later)

## Build + deploy

- `npm run build -w backend` PASS (no backend changes expected, but build must still pass)
- `npm run build -w frontend` PASS
- `pm2 restart meet-poc-fe meet-poc-be`
- Live URL `https://voice.silverjrom.app/` should still load — smoke join/leave once

## Validation gates (your self-checks before STATUS: DONE)

- [ ] `git status` shows clean tree
- [ ] `git log --oneline -5` shows your commits with conventional commit format
- [ ] `npm test -w backend` PASS (59/59 minimum)
- [ ] `npm test -w e2e -- tests/v3-fixc1-camera-light --config=playwright.live.config.ts --workers=1` PASS
- [ ] Run 1 desktop regression PASS (`npm test -w e2e -- --config=playwright.live.config.ts --workers=1` excluding the slow live specs)
- [ ] `pm2 status` shows meet-poc-fe + meet-poc-be online

## Completion

End with:
```
STATUS: DONE — FIXC1 camera-light fix
- Files: <list>
- Commits: <hashes>
- Tests: backend N/N, e2e M/M, run1 K/K
- Branch: fix/meet-fixc1-camera-light
- Tree: clean
```

I will validate via Playwright + on-disk artifact check before dispatching FIXC2. If you break commit-before-DONE, I send a single-gap correction per §1.3.4 — only commit + status-line, no re-implementation.
