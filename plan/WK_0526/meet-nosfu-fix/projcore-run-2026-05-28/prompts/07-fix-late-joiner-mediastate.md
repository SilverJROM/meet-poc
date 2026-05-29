# Fix — late-joiner camera-state default-false bug

## Symptom
JROM (host) + Jtest (joined 2nd) + Jtest2 (joined 3rd). From Jtest2's screen:
- Self tile shows own video correctly (LOCAL).
- Host + Jtest tiles show CONNECTED + GOOD but only initial-avatars, no video.

## Diagnostics confirm
Session `b5610386-68ae-41ad-8213-09c16c974a59`, Jtest2's `inboundTracks` row:
- Video from host: 1.5MB, 862 frames decoded
- Video from Jtest: 7.6MB, 1559 frames decoded
- `firstFrameAtMs` populated for both publishers
- Audio bytes also flowing

So `pc.ontrack` DID fire, `remoteStreams` HAS the video tracks. Subscribe works.

## Root cause
The tile renders an avatar instead of `<video>` when `showVideo()` returns false. `showVideo = forceVideo || (!screenOn && camEnabled && hasVideoTracks)`.

`camEnabled` is sourced from `peerIdentities.get(clientId).camEnabled`. For existing peers, it defaults to `false` (room.page.ts line 933 — admitted handler) and is only updated by `media-state` WS messages.

When Jtest2 joins, the backend's admitted payload includes existing peers (host + Jtest) in `msg.peers` with their identity but no media state. So Jtest2's `peerIdentities` for those two peers has `camEnabled: false` permanently — they have no reason to broadcast their state again now that nothing has toggled.

The host + Jtest broadcast media-state at admit time (line 972) and on every toggle, but NOT when a new peer joins. So Jtest2 never learns the host's cam is on.

## Fix
Re-broadcast own media state when receiving `peer-joined`. This is the simplest, smallest-diff fix — no backend change needed.

File: `frontend/src/app/pages/room/room.page.ts`

In the `peer-joined` handler (around line 1020-1041), after `this.peerIdentities.set(next)` and before `this.queueDiagnosticsLog('state-change')`, add:

```typescript
// Re-broadcast our media state so the new peer learns our current cam/mic/screen — admitted
// payload from backend doesn't carry per-peer media state, so without this the new peer's
// peerIdentities[us].camEnabled stays false → tile shows avatar instead of video.
if (this.state() === 'in-call') {
  this.broadcastMediaState(this.media.micOn(), this.media.cameraOn(), this.media.screenOn());
}
```

Do the same in `peer-resumed` (around line 1053-1073) — same rationale, peer is rejoining.

## Hard constraints
- ONLY touch `frontend/src/app/pages/room/room.page.ts` — two small additions in peer-joined + peer-resumed handlers.
- DO NOT change `broadcastMediaState` itself or the WS protocol.
- DO NOT change initial defaults in the admitted handler — the fix relies on the rebroadcast arriving shortly after admit.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 5/5 PASS.
4. Update `e2e/tests/fixloop-banner/multipeer.spec.ts` (or add a new tiny spec) to assert that after all peers connect, each non-local tile on each page has either `data-state="connected"` AND the camera/avatar rendering reflects the published video track (you can check for absence of `.camera-off-avatar` element OR presence of a `<video>` element inside `.tile-content`). Verify the spec passes.
5. Write `validation/fix-late-joiner-mediastate.md`: timeline, root cause, fix scope.
6. Commit: `fix(room): rebroadcast media-state on peer-joined so late joiners learn existing peers' camera/mic state`. One commit.

## Stop conditions
- 3× build failure → STOP.
- If the new e2e assertion can't reliably observe the camera-on state in playwright's fake-media context, document the limitation in the validation note and ship the fix anyway — the diagnostic evidence from real-browser test is sufficient.

Final line MUST be: `STATUS: DONE — late-joiner media-state fix ready for validation`.
