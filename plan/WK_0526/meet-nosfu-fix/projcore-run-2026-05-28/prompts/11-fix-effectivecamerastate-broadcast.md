# Fix — decouple `effectiveCameraState` from `broadcastMediaState`

## Symptom (latest session)
Session `c7a80dc1-ff3a-4d09-8c9f-77a7c434231c`, 3 peers (jrom + Jtest + Jtest2). All three publish video heavily (jrom 9.7MB rid=h, Jtest 7MB rid=h, Jtest2 3.5MB rid=h). Every peer's diagnostics show inboundTracks for BOTH other peers' video with frames decoded (771, 792, 1476, 1466) and `firstFrameAtMs` populated.

But JROM (host)'s tile renders as initials (no `<video>`) on Jtest2's screen. Jtest's tile renders video correctly. So the asymmetric bug shifted from Jtest to JROM in this round.

## Root cause (architectural)
`room.page.ts:1875-1877` `broadcastMediaState`:
```ts
this.ws.send({ type: 'media-state', mic, cam: this.effectiveCameraState(cam), screenOn });
```

`effectiveCameraState(cam) = cam && cameraVisibleDuringCurrentShare();`

`cameraVisibleDuringCurrentShare()`:
```ts
if (!this.anyScreenShareActive()) return true;
if (this.media.screenOn()) return false;
return this.shareCameraManualOverride();
```

This couples **"what should I tell others about my camera state"** with **"should I render my own self-view tile during a share"**. They are different concerns:

- If a stale `remoteScreenStreams` entry exists OR a peer briefly screen-shares OR any race makes `anyScreenShareActive` return true, the local user broadcasts `cam: false` to everyone — even though their camera is publishing video heavily. Other peers then see `camEnabled: false` → render avatar instead of video.

- The local UI rendering decision (hide own tile during a share) is a separate UX concern and can stay tied to `cameraVisibleDuringCurrentShare`.

The closeLiveTracksForExit cleanup (bd6a96f) addressed the stale `remoteScreenStreams` symptom. But the *coupling* is still fragile — any OTHER source of `anyScreenShareActive===true` (a real concurrent screen-share, a brief glitch, a peer that hasn't finished cleaning up) still mis-broadcasts `cam: false`.

## Fix

File: `frontend/src/app/pages/room/room.page.ts`

Change `broadcastMediaState` to send the **raw** `cam` value (no effective-state gating):

```ts
private broadcastMediaState(mic: boolean, cam: boolean, screenOn = this.media.screenOn()): void {
  this.ws.send({ type: 'media-state', mic, cam, screenOn });
  this.queueDiagnosticsLog('state-change');
}
```

Keep `effectiveCameraOn` and `cameraVisibleDuringCurrentShare` as-is — they're still used for LOCAL self-view rendering decisions (line 233: `effectiveCameraOn = media.cameraOn() && cameraVisibleDuringCurrentShare()`). That's the UX choice "during a share, hide my own self-view" — fine to keep.

The `effectiveCameraState` helper at line 1871 becomes unused by `broadcastMediaState`. **Leave the helper defined** in case it's used elsewhere (check with grep first; if unused, remove). Don't break callers.

## Hard constraints
- ONLY touch `frontend/src/app/pages/room/room.page.ts`.
- Do NOT change `effectiveCameraOn`, `cameraVisibleDuringCurrentShare`, or the local self-view rendering logic.
- The change is exactly one line: `cam: this.effectiveCameraState(cam)` → `cam`.

## Acceptance gate

1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 6/6 PASS (existing tests).
4. Code review: confirm exactly one line changed in `broadcastMediaState`; nothing else.
5. Verify by grep that `effectiveCameraState` is not used elsewhere in `room.page.ts` after the change. If unused, mark for removal in a follow-up (no need to remove in THIS commit — keep diff minimal).
6. Write `validation/fix-broadcast-decoupling.md` — explain why decoupling fixes the asymmetric video bug class permanently.
7. Commit: `fix(room): broadcast raw media.cameraOn() — decouple from local-tile-during-share gating`. One commit.

## Stop conditions
- If e2e suite fails (the existing tests rely on broadcast semantics in some way), STOP and report — maybe the multipeer spec relies on the gating.

Final line MUST be: `STATUS: DONE — broadcast decoupling fix ready for validation`.
