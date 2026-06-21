# sonnet investigation — pre-join device gate (2026-06-10)

## Root cause: confirmed + most-likely path

### Confirmed: `doPublish()` was never called for Joanne

`hasPc: !!this.pc` (`sfu-client.service.ts:931`). `this.pc` is set **only** inside `doPublish()` at `sfu-client.service.ts:1671`. `publishStatus = localPublishState()?.status ?? null` (`sfu-client.service.ts:932`); the signal initializes as `null` (`sfu-client.service.ts:89`) and is only set to `'publishing'` at `sfu-client.service.ts:1664` — the first line of `doPublish()`. Ten consecutive samples all `hasPc=false, publishStatus=null` means `doPublish` never ran across the entire session.

### Three candidate paths — ranked

**PATH A — Publish trigger never fires (silent).**
Guard at `room.page.ts:1777`:
```typescript
if (msg.participantId && msg.sessionId) {
  ...
  void this.publishInitialSfuWithRetry(participantId, sessionId);   // no .catch() on fresh join
}
```
If either field is falsy, the entire block is skipped. No error, no notice. `localPublishState` stays null, `this.pc` stays null. **This is the only 100% silent path.**

Backend: `live.currentSessionId` is typed `string | null` (`signaling/index.ts:52`), initialised `null` (`signaling/index.ts:162`). `ensureLiveSession()` sets it at `signaling/index.ts:379` and is called at `signaling/index.ts:888` — during processing of the WS `join` message, before the peer enters `pending`. `participantId` is always a UUID (`signaling/index.ts:935`).

Under normal flow these are always non-null by admit time. **However**: if the backend ever sends `sessionId: null` (server cold-start, session already closed before admit fires, or missing `openSession` call on a code-path we haven't read), the frontend silently never publishes. The guard is an unprotected implicit contract.

**PATH B — `initialPublishStream()` throws `InitialPublishPermanentError` before `doPublish` runs.** (`room.page.ts:1660`)
If `media.localStream()` is null or all tracks have `readyState === 'ended'` at the time of the `admitted` message, `initialPublishStream()` throws after a 1500ms poll. Because it's an `InitialPublishPermanentError`, `isRetryableInitialPublishFailure()` returns false (`room.page.ts:1666`), a single attempt is made, then `initialPublishFailureNotice` is set with "Audio/video could not start from the current device state." Since `doPublish` was never reached: `localPublishState = null`, `hasPc = false`. A UI notice IS shown to the joiner.

When would `localStream()` have ended audio tracks by admit time? Joanne joined (MacBook/Chrome), waited in the knock queue. Chrome on macOS keeps the mic across backgrounding. More plausible: she had mic **permission** but the device was already in use by Zoom/Teams, or she dismissed the permission prompt a second time during the wait.

**PATH C — All 3 retry attempts exhausted; diagnostic snapshot taken post-exhaust.**
`doPublish` could create `this.pc` (`sfu-client.service.ts:1671`), fail mid-flight (e.g. `/api/sfu/session` HTTP error), land in catch (`sfu-client.service.ts:1755`), and re-throw. The retry loop at `room.page.ts:1580` calls `resetFailedInitialPublishAttempt()` → `sfuClient.resetFailedPublishAttempt()` → `closePeerConnectionForRecovery()` → **`this.pc = null`** (`sfu-client.service.ts:527`) AND `localPublishState.set(null)` (`sfu-client.service.ts:999`) before the next attempt. After all 3 attempts fail, the final state is `hasPc=false, publishStatus=null` with `initialPublishFailureNotice` set. Ten 1-second samples across her ~1-minute session is consistent with this being the post-exhaust steady state.

### Most likely: PATH B or C

`lastGumError=null` rules out a getUserMedia rejection. Path B (no live tracks) is the cleaner explanation because it collapses to one attempt with no backoff. Path C requires a network-level failure to `/api/sfu/session` or `/api/sfu/tracks`, which would be unusual if signaling was already connected. PATH A cannot be ruled out without adding the observability field below.

### One observability field to add

Add `publishTriggerCount: number` to diagnostics — incremented at the top of `publishInitialSfuWithRetry` before the guard at `room.page.ts:1555`, independent of whether the function returns early. If `publishTriggerCount === 0` on any sample → Path A (trigger never fired). If `publishTriggerCount >= 1` → Path B or C. This single counter disambiguates all three paths from persisted data.

---

## Gate design: R1–R7 on existing scaffolding

### Gate states

The lobby's existing `RoomState` does not need a new enum value. Instead, add a `preflightGateStatus` signal:

```typescript
type PreflightGateStatus =
  | 'pending'         // preflight running or not yet started
  | 'mic-fail'        // classifyMicCapture → silent; lobbySelfTestFlag stays false
  | 'speaker-needed'  // mic OK; speaker test not yet done
  | 'ready'           // mic verified + speaker tested → Join unblocked
  | 'audio-connecting' // post-admit, publishInitialSfuWithRetry running
  | 'audio-failed';   // retries exhausted
```

### Where Join is hard-blocked (R5)

`join()` at `room.page.ts:827` already calls `missingJoinPrereqs()`. Extend the prereq check to add a `'preflight'` failure:

```typescript
// room.page.ts — missingJoinPrereqs()
if (!this.hasMicAccess()) missing.push('mic');
if (!this.lobbySelfTestFlag()) missing.push('mic-silent');   // B5 already populates this
if (this.speakerTestCount() === 0) missing.push('speaker');  // NEW: require speaker test once
```

Join button disabled (`disabled="...preflightGateStatus() !== 'ready'"`) until both flags clear. This leverages the already-running `lobbySelfTestFlag` poller without new device code.

### R4: device-config-test panel auto-trigger

The `lobbyDeviceDialogOpen` signal and `DeviceDialogComponent` already exist. On entering lobby state, start a 3-second watchdog: if `lobbySelfTestFlag()` is still false after 3 s, **auto-set `lobbyDeviceDialogOpen = true`** and show a friendly banner ("We can't hear your mic"). The panel already has device dropdowns; extend it with:
- **Mic level meter** — driven by `micLevel` signal (already live in lobby: `room.page.ts:2187`)
- **Speaker test button** — calls `speakerTest()` (already `room.page.ts:1033`)
- **Camera preview** — already rendered in lobby
- **"Looks good → Confirm"** button — sets `preflightGateStatus = 'ready'` if mic+speaker pass

### R3: connection confirmation (no throwaway session)

Do NOT add a throwaway SFU publish. Instead make the REAL join→publish visible:

1. After `admitted` fires (`room.page.ts:1743`), before calling `publishInitialSfuWithRetry`, set `preflightGateStatus = 'audio-connecting'`. Template shows "Connecting your audio…" spinner overlay on the in-call view (not a separate page).
2. `publishInitialSfuWithRetry` already has `initialPublishRetrying` signal. Wire the spinner to `initialPublishRetrying()`.
3. On `localPublishState.status === 'published'`: clear spinner, set `preflightGateStatus = 'ready'`.
4. On retries exhausted (`initialPublishFailureNotice` set): set `preflightGateStatus = 'audio-failed'`. Show persistent banner:

> "We couldn't connect your audio. [Retry audio] [Rejoin call]"

"Retry audio" calls a new `retryPublishAudio()` method that resets `initialPublishRunId` and calls `publishInitialSfuWithRetry` again (already the pattern used in `republishSfuAfterTransportRecovery`).

### R7: underlying fix so hasPc=false/never-publish cannot be silent

Three concrete changes:

1. **Defensive guard**: at `room.page.ts:1777`, if `msg.participantId` or `msg.sessionId` is missing, set `preflightGateStatus = 'audio-failed'` and surface the error banner — never silent.

2. **Diagnostic counter**: add `publishTriggerCount` (see observability above).

3. **Remove the void-no-catch for fresh join**: change `room.page.ts:1786` from:
   ```typescript
   void this.publishInitialSfuWithRetry(participantId, sessionId);
   ```
   to:
   ```typescript
   void this.publishInitialSfuWithRetry(participantId, sessionId).catch((err: unknown) => {
     console.error('[sfu-client] publish failed (fresh join)', err);
     this.preflightGateStatus.set('audio-failed');
   });
   ```
   The function already catches internally; this catches any unexpected outer throw and shows the error banner.

---

## Edge cases

| Scenario | How gate handles it |
|---|---|
| **Permission denied before join** | `startLobbyPreflight` catches NotAllowedError → `handleLobbyMediaError` sets `permissionError.kind = 'denied'` → `hasMicAccess() = false` → Join blocked + existing permission error UI |
| **Permission revoked mid-gate** | Audio track fires `ended` event → `attachLocalTrackFailureHandlers` triggers local track recovery → `lobbySelfTestFlag` drops to false within 1 s → Join re-blocks; device panel auto-opens |
| **No mic at all** | `preflight()` throws NotFoundError → handled → `lobbyError.kind = 'no-devices'` → existing "no devices" UI; Join blocked |
| **OS-muted mic** | Track is `live` but energy is 0 → B5 `classifyMicCapture` → `lobbySelfTestFlag = false` → Join blocked; device panel shows live meter at 0 |
| **Mobile speaker test autoplay** | `speakerTest()` uses `AudioContext` which requires user gesture. The speaker test button click IS a user gesture. On iOS, the `unlockAudioFromGesture` call in `join()` also covers this. Speaker test should be done as part of the panel (user taps button = gesture). |
| **Camera optional** | R1 says camera is OPTIONAL. Gate only blocks on mic + speaker. Camera preview shown if permission granted; skip camera if denied (existing `video-denied-but-audio-ok` path). |
| **Host vs joiner** | Same gate for both. Host's room stays open for joiners while host is in green room; existing `prepareLobbyDeviceCheck` runs for both. |
| **Reconnect/rejoin** | On `admitted` with `wasInCall = true` (`room.page.ts:1744`): skip speaker test re-gate (already connected before). Set `preflightGateStatus = 'audio-connecting'` and proceed directly to `publishInitialSfuWithRetry`. |
| **Device unplug during gate** | `navigator.mediaDevices.devicechange` fires → `handleDeviceChange` runs → `ensureSelectedAudioDevice` re-evaluates → if no fallback, `lobbySelfTestFlag` drops, panel opens |
| **Device unplug during audio-connecting** | Local track `ended` event → existing `decideLocalTrackFailureRecovery` → `recover-ended` → re-acquire → `initialPublishStream` retry picks up the new track |

---

## Device-selection persistence bug (R8 addendum)

### Bug location

`syncSelectedAudioIdToTrack` at `room.page.ts:2588–2591`:

```typescript
const fallbackChosenId =
  requestedDeviceId && stage !== 'exact' && trackReportedId !== requestedDeviceId
    ? (!isGenericAudioDeviceId(trackReportedId) ? trackReportedId : '')   // ← BUG
    : resolvedId || this.selectedAudioId();
```

When the capture track reports a generic deviceId (`'default'`, `'communications'`, `''`) — common on macOS Chrome even when a specific mic was acquired — and `requestedDeviceId ≠ trackReportedId`, the ternary evaluates `''`. This makes `chosenId = ''` in the subsequent `resolveSelectedAudioId` call.

In `resolveSelectedAudioId` (`device-selection.ts:51`):
- Rule 1: `trackReportedId = 'default'` → `isGenericAudioDeviceId` = true → SKIP
- Rule 2: `chosenId = ''` → falsy → **SKIP** (this is THE fix that should have preserved the choice, but it can't fire with empty `chosenId`)
- Rule 3: `storedId` = the PREVIOUS device → if enumerated → **RETURNS previous device**
- Result: `selectedAudioId` snaps back to the old device; the new selection is never persisted

### Fix

Change the `''` fallback in `syncSelectedAudioIdToTrack` (`room.page.ts:2590`):

```typescript
// before
? (!isGenericAudioDeviceId(trackReportedId) ? trackReportedId : '')
// after
? (!isGenericAudioDeviceId(trackReportedId) ? trackReportedId : requestedDeviceId)
```

With `chosenId = requestedDeviceId` (concrete, non-generic), rule 2 of `resolveSelectedAudioId` fires: if `requestedDeviceId` is still enumerated → returns it → stored. Device selection persists.

### Persistence test to add (`room-decisions.spec.ts`)

The `resolveSelectedAudioId` unit test coverage in `room-decisions.spec.ts` should add a case that matches the bug scenario — the function itself doesn't exhibit it (it's a correct pure function), so the test belongs in a new unit for `syncSelectedAudioIdToTrack` logic OR in the spec for the `fallbackChosenId` derivation:

```
given: requestedDeviceId='device-B', trackReportedId='default', stage='default',
       previousStoredId='device-A', enumeratedIds=['device-A','device-B','default']
then: fallbackChosenId should be 'device-B' (not '')
and:  resolveSelectedAudioId({chosenId:'device-B', ...}).result === 'device-B'
```

This test fails before the fix and passes after.

---

## Risks / what could make this fix also fail

1. **`localPublishState` null-window in diagnostics**: even with the R7 fix, if a diagnostic snapshot is taken BETWEEN retries (during backoff delay), `publishStatus` will be null and `hasPc=false` regardless. The `publishTriggerCount` field closes this gap.

2. **`initialPublishStream` 1500ms deadline too short on slow mobile connections**: `media.localStream()` may still be null at admit time on a slow device. The 1500ms poll was enough for JROM's tests but not a remote joiner's cold device. The gate's R1/R2 validation in lobby (confirm mic working BEFORE joining) should eliminate this path because the user won't reach `admitted` without a live stream.

3. **Speaker test autoplay gating on iOS Safari**: `AudioContext` requires a user gesture on iOS. If the gate shows the speaker test button in a non-gesture context (e.g. auto-opened dialog), the test will fail silently. Solution: always show the speaker test as an explicit user action button; never auto-play the tone.

4. **Generic deviceId snap-back after the R8 fix**: the fix preserves `requestedDeviceId` but doesn't verify the track actually carries audio from that device. If the OS silently gave a different device despite the request, the stored ID would be wrong. `verifyInitialCaptureEnergy` (B2a) catches this post-publish; the lobby self-test (B5) catches it pre-join. Both are already wired.

5. **`publishInitialSfuWithRetry` runId race**: on a fast reconnect, `initialPublishRunId` is incremented in `cleanupCall()` (`room.page.ts:2449`). If `publishInitialSfuWithRetry` from the previous admit is still in backoff when a second `admitted` message arrives (reconnect), the first invocation's `runId` check at `room.page.ts:1564` will cause it to return silently. The second invocation runs normally. This is correct behaviour and is not a risk.
