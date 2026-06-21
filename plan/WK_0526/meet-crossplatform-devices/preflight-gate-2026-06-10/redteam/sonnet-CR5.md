# CR5 Red-Team: Multi-guest / Reconnect / Bypass / Host-as-user / R10-in-practice
**Reviewer:** claude-sonnet-4-6  
**Lens:** L5 (adversarial — distinct from CR1-4)  
**Date:** 2026-06-10

---

## Multi-guest / reconnect / bypass findings (file:line) or none

### 1. Speaker test plays to OS default output, not the selected speaker device [NON-CRITICAL]

**File:** `room.page.ts:1087`  
```typescript
gain.connect(context.destination);  // always OS default
```
`AudioContext.destination` is always the OS default audio output. The Web Audio API has no `setSinkId` equivalent. If the user selects a non-default speaker (e.g., USB headset) in the device dialog, the test tone plays through the laptop speakers (OS default), not the headset. The user hears it from the laptop, clicks "Yes", and `speakerVerified = true`. The headset — which will actually receive in-call audio via `setSinkId` — was never validated.

This is a gate mismatch between what is tested and what is used in the call. Not exploitable maliciously (user can't hear others if their headset is dead), but R10(f) / R1 speaker verification is weaker than it appears for non-default output devices. No fix available within the Web Audio API surface — the limitation is browser-level.

---

### 2. Reconnecting peer (old clientId, past grace) gets stale unhealthy badge during disconnect window [NON-CRITICAL]

**File:** `room.page.ts:2957–2994`  
`updateRemoteAudioHealth` does not check `peer.reconnecting`. When `peer-reconnecting` arrives and the peer's SFU track bytes freeze, the classification path is: `isPublishing=true` (old session still in `remotePublishers` briefly) → `stalled`, OR after SFU track removal: `isPublishing=false, pastGrace=true` → `never-published`. Either routes to `unhealthy.add(clientId)` → badge shows "No audio" for the reconnecting peer during their entire disconnect window (potentially 5–30s).

After `peer-resumed` the new clientId gets fresh `peerFirstSeen → now` → 7s grace → badge is suppressed for the rejoined session. So the badge persists only during the reconnect gap on the OLD id. This is ephemeral and self-corrects, but it may alarm the host for a peer who is actively mid-reconnect rather than truly broken.

**Root cause:** no `reconnecting` guard in `classifyPeerAudioHealth` or `updateRemoteAudioHealth`. Previous reviews did not cover this path (only the Joanne never-published case was tested).

---

### 3. `speakerTestPending` shows Yes/No buttons immediately after `oscillator.start()`, before sound audibly plays [NON-CRITICAL]

**File:** `room.page.ts:1096`  
```typescript
oscillator.start();
// ... setTimeout(stop, 1000)
this.speakerTestPending.set(true);  // shows Yes/No in same microtask
```
A user can click "Yes" in the same browser event loop tick that the button appears, before the 1s tone has had time to travel through the audio path. There is no enforced wait. This is not a meaningful security bypass (user only degrades their own experience), but the gate's auditory guarantee is weaker than it appears: a sufficiently fast click or a test automation script can confirm the speaker without ever hearing the tone.

---

### 4. `requireLiveTransceiver` helper is unit-tested as R10(i) but never called from runtime [NON-CRITICAL]

**Files:** `room-decisions.ts:268`, `room-decisions.spec.ts:589-601`  
The function is exported and thoroughly tested (null/undefined throws, live object passes). However, `grep -rn requireLiveTransceiver` returns zero hits in the runtime (`room.page.ts`, `sfu-client.service.ts`). The SFU client creates transceivers unconditionally via `addTransceiver` (line 1710–1712), so the null case doesn't arise in production. R10(i) validates the helper in isolation but not the production transceiver path. The test is structurally decoupled from the actual runtime invariant it is supposed to protect.

---

### Multi-guest correctness — CLEAN

`prevInboundBytes` and `peerFirstSeen` are both keyed by `peer.id` / `publisherClientId`. These resolve to the same WS `clientId` (confirmed via `RemotePublisher.clientId` → `midToEntry.publisherClientId` → `SfuInboundTrackStats.publisherClientId`). No cross-peer state bleed for 3+ participants.

`classifyPeerAudioHealth` for mixed states (muted peer, healthy peer, never-published peer): muted → 'ok' (first guard), healthy → 'ok' (bytes climbing), never-published past grace → 'never-published' → badge only for the broken one. ✓

---

### Reconnect gate path — CLEAN

`peer-resumed` assigns new `clientId` → `peerFirstSeen[newId] = now` → 7s grace restarts → no false badge on fresh rejoin. Old id pruned from `peerFirstSeen` at next `updateRemoteAudioHealth` poll (pruning-while-iterating over `Map.keys()` is safe per ECMAScript iterator spec). `prevInboundBytes` repopulated from `inboundByClientId` (keyed by `publisherClientId`), old id evicted automatically. ✓

WS reconnect (`wasInCall=true`) re-enters `publishInitialSfuWithRetry` via the admitted handler (line 1934–1949) — does NOT skip the gate because the gate is a PRE-JOIN signal and was already passed before the original admit. This is correct by design (R1 gate is once per join episode, not per WS reconnect). `preflightGateStatus` transitions correctly from 'ready' → 'audio-connecting' → 'ready' (or audio-failed). ✓

---

### Adversarial gate-bypass — CLEAN

**Double-click Join:** `if (this.state() === 'connecting') return;` (line 858) prevents re-entry. ✓

**`onPreflightConfirm` bypass:** Only closes dialog and clears popout (line 965–968). Does NOT call `join()`. User must still click Join, which re-evaluates `missingJoinPrereqs()`. ✓

**Refresh mid-gate:** `cleanupCall()` resets `speakerVerified=false`, `speakerTestPending=false`, and `stopLobbySelfTest()` resets `micWorking=false`. All gate signals cleared on any rejoin. ✓

**Speaker 'Yes' without tone:** `testSpeaker()` clears `speakerVerified` before attempting to play; sets `speakerTestPending=true` only after `await context.resume()` AND `oscillator.start()` succeed; if `AudioContextCtor` is absent or `resume()` throws, sets error and never shows Yes/No. A completely silent device (no audio subsystem) cannot produce a valid tone → try/catch blocks the gate. ✓ (Finding #3 above is a weaker form: tone starts but hasn't audibly played before Yes is clicked — different scenario.)

**Mic verified then unplugged before join:** `changeAudioDevice` clears `micWorking.set(false)` (line 1004). Device removal without `changeAudioDevice` is caught at next lobby self-test poll (1s interval) via `micActive = !!track && track.readyState === 'live'` → classification falls to 'silent'/'indeterminate' → `nextMicWorkingState` → false. ✓

**Programmatic state manipulation (console):** No server-side enforcement of client-side gate signals. However: the gate (missingJoinPrereqs) checks `micWorking()` at join time and `publishInitialSfuWithRetry` then verifies an actual live audio track exists (`stream.getAudioTracks().some(t => t.readyState !== 'ended')`), throwing `InitialPublishPermanentError` if absent. Bypassing the gate only means you attempt publish without a working mic — the post-admit check fails anyway. ✓

---

### Host-is-also-a-user gate — CLEAN

`isHost()` is `computed(() => this.isOwner() || (!!this.myId() && this.hostClientId() === this.myId()))`. Before join: `myId()=null`, `isOwner()=false` (reset in `cleanupCall` at line 2649). Host identity is only set after the server's 'admitted' message (line 1904: `isOwner.set(!!msg.isOwner)`). Therefore in the lobby, the host is indistinguishable from a guest, and `missingJoinPrereqs()` applies identically. `confirmGate="true"` is hardcoded in the lobby device dialog (line 701 patch) — both host and guest see the Confirm gate. ✓

---

### R10 in-practice traces (two paths)

**R10(a) — never-published reaches badge:**
1. Peer P admitted, `peerFirstSeen[P] = T_join`
2. Polls at T+1.5s, T+3s, ...: `pastGrace=false` → 'ok', no badge
3. Poll at T+8.5s: `pastGrace=true`, `isPublishing=false`, `micEnabled=true` → `never-published` → `unhealthy.add(P)`
4. `remoteAudioUnhealthyIds.set(unhealthy)` — signal updated
5. Template: `[audioUnhealthy]="isHost() && peerAudioUnhealthy(peer)"` — reads signal `remoteAudioUnhealthyIds()` inside `peerAudioUnhealthy()`, tracked by Angular change detection
6. `<span class="audio-health-badge">No audio</span>` renders ✓

Runtime path is fully connected. No gap between pure-fn test and live execution.

**R10(d) — state-revert-mid-publish → audio-failed:**
1. User is admitted: `publishInitialSfuWithRetry` called, `preflightGateStatus='audio-connecting'`
2. `startAudioConnectingTimeout()` starts 15s timer
3. Network drops → WS close callback fires → `state='lobby'` (if not yet in-call) OR state stays 'in-call' with reconnect
4. In the early-return path inside the retry loop: `if (runId !== this.initialPublishRunId || this.state() !== 'in-call') return;`
5. Loop returns without setting `publishSucceeded=true`
6. `finally` block: `runId === this.initialPublishRunId` → `clearAudioConnectingTimeout()` → `shouldSurfacePublishFailure({publishSucceeded:false, gateStatus:'audio-connecting'})` → `true` → `preflightGateStatus.set('audio-failed')` (line 1036–1044)
7. Host path: `shouldShowAudioFailNotice` → notice shown; `shouldOpenDeviceDialogOnAudioFail` → dialog opens

Runtime path confirmed through the actual `finally` block, not just the pure-fn test. ✓

---

## Any remaining CRITICAL?

None found. CR1-4 fixes are intact and operating correctly in the runtime flow.

---

## Findings

**[NON-CRITICAL]** Speaker test uses `AudioContext.destination` (OS default), not selected output device — passes gate even when the designated in-call speaker hasn't been validated  
**[NON-CRITICAL]** Reconnecting peer (old clientId past grace) shows stale "No audio" badge during the reconnect window — ephemeral, self-corrects after `peer-resumed` + new 7s grace  
**[NON-CRITICAL]** `speakerTestPending=true` fires before the 1s tone has traversed the audio path — Yes button is clickable before the tone audibly plays  
**[NON-CRITICAL]** `requireLiveTransceiver` is tested as R10(i) invariant but is never called at runtime — production transceiver guard is in SFU client, structurally decoupled from the unit test

---

STATUS: CRITICAL-CLEAN — no critical bugs found; four non-critical findings, none exploitable as meaningful bypasses or data-integrity failures
