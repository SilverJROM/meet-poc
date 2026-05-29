# Investigate + fix — Jtest's video not rendered on Jtest's own local tile + on Jtest2's tile (but works on host)

## Symptom (verified via diagnostics)
Session `95b38671-67ef-43c6-8c6b-461d9beae99a` (Host JROM + Jtest + Jtest2, no screen-share):

**SFU layer is healthy — every peer publishes + receives every other peer's video:**
- jrom (`e2accd1430aa354a`): outbound video sent on rid h, m, l; receives Jtest's video (4.5MB / 1056 frames decoded), receives Jtest2's video (757KB / 356 frames)
- Jtest (`2681d22c5cd5eb79`): outbound video sent on rid h (5MB), m (1.2MB), l (0); receives jrom's video (4.0MB / 1038 frames), receives Jtest2's video (1.6MB / 361 frames)
- Jtest2 (`cd05a48fc0263416`): outbound video sent on rid h, m, l=0; receives jrom's video (831KB / 157 frames), **receives Jtest's video (662KB / 138 frames)**

`subscribeLatencies` populated for every pair. `firstFrameAtMs` non-null. So `pc.ontrack` fires and tracks are added to `remoteStreams`.

**UI symptom (per JROM):**
- Host: sees both Jtest's video + Jtest2's video — WORKS ✓
- Jtest: **does NOT see his own local video (own self-view tile shows avatar, not video element)** ✗
- Jtest2: sees jrom's video; **does NOT see Jtest's video** (shows avatar) ✗

So `showVideo()` returns false on those two tiles even though the data is there. Recall `showVideo = forceVideo || (!screenOn && camEnabled && hasVideoTracks)`.

## Hypothesis

For Jtest's LOCAL tile: `camEnabled` is sourced from `effectiveCameraOn() = media.cameraOn() && cameraVisibleDuringCurrentShare()`. If either evaluates false, `showVideo` is false → avatar.

For Jtest's tile on Jtest2's view: `camEnabled = identity.camEnabled` from `peerIdentities`. Updated only via `media-state` WS message. If Jtest broadcasts `cam: false`, Jtest2's view sets camEnabled=false.

Critical observation: `broadcastMediaState` sends `cam: this.effectiveCameraState(cam)` where `effectiveCameraState(cam) = cam && cameraVisibleDuringCurrentShare()`. So if `cameraVisibleDuringCurrentShare()` returns false on Jtest's side, Jtest broadcasts `cam: false` even though `media.cameraOn() === true` and his camera is publishing video.

`cameraVisibleDuringCurrentShare()`:
```ts
if (!this.anyScreenShareActive()) return true;
if (this.media.screenOn()) return false;
return this.shareCameraManualOverride();
```

`anyScreenShareActive = media.screenOn() || sfuClient.remoteScreenStreams().size > 0`. If `sfuClient.remoteScreenStreams()` has a STALE entry on Jtest's side (from an earlier session's screen-share, or a peer that already left, or a never-cleaned-up entry), `anyScreenShareActive` returns true → `cameraVisibleDuringCurrentShare()` returns `shareCameraManualOverride()` which defaults to `false` → broadcasts `cam: false` even though no actual share is happening + local self-view hides his own camera.

This would explain ALL the observed symptoms:
1. Jtest's own local tile shows avatar (effectiveCameraOn → false)
2. Jtest's tile on Jtest2's view shows avatar (Jtest broadcasted cam: false)
3. Host sees Jtest's video (maybe host got cam: true from Jtest at an earlier moment when remoteScreenStreams was empty, OR host is also affected but JROM didn't notice)

## What I need from you

**Investigate first.** Read in order:
1. `frontend/src/app/pages/room/room.page.ts:230-235` (`anyScreenShareActive`, `effectiveCameraOn`).
2. `frontend/src/app/pages/room/room.page.ts:1863-1870` (`cameraVisibleDuringCurrentShare`, `effectiveCameraState`).
3. `frontend/src/app/services/sfu-client.service.ts` — find every write to `this.remoteScreenStreams` and every removal path. Are there any cases where a screen track is added to `remoteScreenStreams` but never removed when the peer leaves or stops sharing?
4. The peer-leave / `removePeer` / `handleSfuRosterRemoved` / `handleSfuPresence` code paths — do they clean up `remoteScreenStreams`?
5. The `pc.ontrack` handler — when a screen track arrives, it adds to `remoteScreenStreams`. When does it get removed?
6. Look at the diagnostic — for the Jtest session, was there ANY screen track at any point? (My read: no.) If no screen track was ever published, but `anyScreenShareActive` could still return true, look for a bug where `remoteScreenStreams` gets set but never reaches that data source — e.g., a track erroneously classified as 'screen' due to kindMap mistake.
7. Re-read `pc.ontrack` in sfu-client.service.ts around line 600-640. The `entry.kind === 'screen'` branch adds to `remoteScreenStreams`. If `kind` from `kindMap` is wrongly 'screen' for what should be 'video', this would erroneously populate remoteScreenStreams.

## Possible alternative hypotheses

H-A: `remoteScreenStreams` has stale entries (the primary hypothesis above).

H-B: `kindMap` mis-classifies a video track as screen. Look at `doSubscribeTracks` (sfu-client.service.ts around line 720) — `kindMap.set(t.trackName, t.kind)` — is t.kind from CF response or from our own request? If CF returns 'screen' when we asked for 'video', that's a bug.

H-C: `screenStreams.has(jtest_clientId)` is true on Jtest2's side because of some mis-classification — but the spec is for Jtest2's view of Jtest, and `peers()` line 203 sets `screenOn: identity.screenOn || screenStreams.has(clientId)`. If screenStreams has Jtest's clientId, screenOn becomes true → showVideo false → avatar.

H-D: Jtest's `media.cameraOn()` is actually false despite outbound video being sent. The `replaceVideoTrack` path or simulcast layer change might decouple `cameraOn` signal from the actual capture state.

## Reply format

**Don't write code yet.** Reply with:

```
STATUS: HYPOTHESIS-CONFIRMED  or  STATUS: NEED-MORE-INFO

Most-likely root cause: <one paragraph>

Evidence from code: <bullet list with file:line>

Proposed fix (minimum diff): <bullet list, no code>

Verification: <how we'd prove it both in playwright AND in real browser>
```

Once you confirm, I'll greenlight the fix.
