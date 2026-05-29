# Fix — closeLiveTracksForExit must clear all subscribe-side state (matches destroy())

## Root cause (confirmed by inspection)

`SfuClientService` is `providedIn: 'root'` — an app-wide singleton. When a user leaves a room (via `cleanupCall` → `closeLiveTracksForExit`), the service is NOT destroyed; only the room.page Angular component is.

`closeLiveTracksForExit` currently clears: pc, callerCreds, localPublishState, publishPhase, opQueue, pendingOntrack, subscribeStuckTimers.

It does NOT clear: `remoteStreams`, `remoteScreenStreams`, `remotePublishers`, `subscribedTracks`, `subscribedClientIds`, `midToEntry`, `subscribeRetryAttempts`, `subscribeInitiatedAt`, `subscribeFirstFrameAt`.

When the user later JOINS another room (or rejoins the same room without hard refresh), those Map signals still carry the prior session's entries. Specifically:

- **`remoteScreenStreams.size > 0`** from a prior screen-share → `anyScreenShareActive()` returns true in the new call
- → `cameraVisibleDuringCurrentShare()` returns false (no manual override yet)
- → `effectiveCameraOn()` returns false even though `media.cameraOn() === true`
- → Local self-view hides own camera (shows avatar)
- → `broadcastMediaState` broadcasts `cam: false` because `effectiveCameraState(cam) = cam && false`
- → Other peers see Jtest's `camEnabled = false` → Jtest's tile renders avatar on their screens

This matches JROM's exact symptoms (Jtest's local tile + Jtest2's view of Jtest both show avatar, while host sees Jtest's video because host did fresh-load).

## Fix

File: `frontend/src/app/services/sfu-client.service.ts`

In `closeLiveTracksForExit()` (around line 689-718), add the same Map-clearing block that `destroy()` does. Place these clears immediately after the existing `this.opQueue = Promise.resolve();` and `this.pendingOntrack.clear();` and `this.clearAllSubscribeStuckWatchdogs();` block, BEFORE the `if (!publishState || !creds...) return;` early-exit:

```ts
this.subscribedClientIds.clear();
this.midToEntry.clear();
this.subscribeRetryAttempts.clear();
this.subscribeInitiatedAt.clear();
this.subscribeFirstFrameAt.clear();
this.remotePublishers.set(new Map());
this.remoteStreams.set(new Map());
this.remoteScreenStreams.set(new Map());
this.subscribedTracks.set(new Map());
this.audioSender = null;  // already cleared inside the if (pc) block, but be safe
this.videoSender = null;
this.screenSender = null;
```

Effectively: `closeLiveTracksForExit` becomes a superset of `destroy()` (minus the absolute teardown — we still want the service singleton alive for the next room).

## Hard constraints
- ONLY touch `frontend/src/app/services/sfu-client.service.ts`.
- Do NOT change `destroy()` or `resetForReconnect()`.
- Do NOT change any other logic in `closeLiveTracksForExit` — only ADD the clears.

## Acceptance gate
1. `cd backend && npm run build` — 0 errors.
2. `cd frontend && ng build` — 0 errors.
3. `cd e2e && E2E_BASE_URL=http://localhost:4700 npx playwright test tests/fixloop-banner/ --reporter=line` — 5/5 PASS.
4. Add a small regression test or extend `multipeer.spec.ts` to:
   - Have one peer JOIN, LEAVE, and JOIN AGAIN (same browser context — no hard refresh)
   - Assert their local self-view tile renders `<video>` (not avatar) on the second join
   - This proves the cross-session state cleanup works in playwright
5. Write `validation/fix-closeexit-clears.md` with the root-cause walkthrough.
6. Commit: `fix(sfu): closeLiveTracksForExit clears remoteScreenStreams + remoteStreams + per-publisher state to prevent cross-room leakage`. One commit.

## Stop conditions
- 3× build failure → STOP.
- If the rejoin-test exposes a different bug (e.g., a publish-side state isn't cleaned), document it and ship just the close-fix without the new test step; we'll iterate.

Final line MUST be: `STATUS: DONE — closeLiveTracksForExit cleanup fix ready for validation`.
