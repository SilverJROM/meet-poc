# gpt54 CODE red-team CR7 (lens L7: state-machine + lifecycle)
## State-machine: any contradictory/stuck/lying combination?

Mostly consistent, but not clean.

- The core product is otherwise coherent:
  `mutedAll` explicitly clears `voiceStalled` in both the service and watchdog paths ([frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:240), [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2730)).
  `playbackFailure === 'unsupported'` is intentionally outside the unblock-banner lane ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:624), [remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:640)).
  Registry teardown/reset is comprehensive ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:424)).

- Reachable contradictory/stuck state after sequential sink calls:
  `applyOutputDevice()` sets `entry.blocked = true` on sink failure, but its success branch never clears `entry.blocked` ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:291)).
  Reachable product:
  `blocked=true`, `voiceStalled=false`, `paused=false`, `playbackFailure=null`, `sinkApplyResult='selected'|'default-fallback'`, `sinkApplyTimedOut=false`.
  `refreshBlockedState()` still raises `remoteAudioBlocked` from stale `blocked` alone ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:622)).
  `remoteAudioBlockedReason()` then reports `autoplay` if the element is currently unpaused ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:640)).
  Result: the room can show "Tap to enable audio" ([room.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:227)) while audio is already audible on the prior/default sink. This state is stuck until a later `play()` success path, recovery replay, publisher replacement, or full reset.

- Genuine autoplay-blocked states are misclassified:
  when `play()` rejects for a gesture reason, the entry ends up `blocked=true`, `playbackFailure=null`, and the element remains `paused=true` ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:523)).
  But `remoteAudioBlockedReason()` checks `paused` before `blocked` ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:643)), so the diagnostic cause becomes `paused`, not `autoplay`.
  The banner text is gesture-oriented, but the per-publisher reason lies about why it is blocked.

## Reset hygiene: any field leaking stale state across calls?

Almost all CR7-target fields reset correctly.

- `unlocked`, `selectedSinkId`, `effectiveSinkId`, `usedDefaultSinkFallback`, `mutedAll`, registry contents, `remoteAudioBlocked`, and voice-recovery counters are cleared by `remoteAudio.reset()` ([remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:424)).
- `remoteVoiceWatchdogPeers` and `micSilenceWindow` are cleared on call cleanup/stop paths ([room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2436), [room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2715), [room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:3326)).
- SFU retry guards/permanent-stop siblings are reset: `subscribeMidConflictWarnings`, `subscribeRetryAttempts`, `midCallSubscribeRetryAttempts`, `liveMidConflictRetryAttempts/timers`, pending mids/streams, and transport recovery state are cleared in transport/exit teardown ([sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:534), [sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1589), [sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1633)).

- Leak found: `selectedSpeakerUnavailable` survives leave/rejoin.
  It is set from per-call routing outcomes and missing-device reconciliation ([room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:676), [room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:1019), [room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2357), [room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2637)).
  But `cleanupCall()` never clears it ([room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2433)).
  On the next call, if the user is on default output (`selectedAudioOutputId()` empty), the in-call speaker-refresh effect does not run its clearing branch (`if ... || !deviceId return`) ([room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:669)).
  Result: a stale "Selected speaker unavailable. Using system default." banner can leak into the next independent call even though no selected speaker is active anymore.

- Sibling stale field: `deviceDialogError` is also not cleared in `cleanupCall()` ([room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2433)). It is lower impact because it is dialog-scoped, but it is the same stale-state class.

## NEW bugs

| severity | file:line | bug | why it matters |
|---|---|---|---|
| P1 | [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:291), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:622), [frontend/src/app/pages/room/room.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:227) | `entry.blocked` latches across sequential sink-apply calls. A failed `applyOutputDevice()` marks the entry blocked; a later successful sink apply does not clear it. | Produces a contradictory/stuck state: banner says "Tap to enable audio" and diagnostics can say `autoplay` while remote audio is already playing. |
| P2 | [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:640), [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:523) | Real autoplay blocks are reported as `paused`, not `autoplay`, because `paused` wins before `blockedReason` reaches the `blocked` branch. | The per-publisher diagnostic reason is not truthful across the gesture-blocked transition. |
| P1 | [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2433), [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:669), [frontend/src/app/pages/room/room.page.html](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.html:221) | `selectedSpeakerUnavailable` is not reset on leave/rejoin, and the next call may not clear it when using default output. | Cross-call stale-state leak: the next independent call can inherit a false unavailable-speaker banner. |
| P2 | [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:3515), [backend/src/modules/sessions/store.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/store.ts:282), [backend/src/modules/sessions/index.ts](/home/agjrom/websites/meet-poc/backend/src/modules/sessions/index.ts:143) | Diagnostics redaction is UI-only. Raw `selectedAudioDeviceId`, `selectedAudioOutputId`, `selectedVideoDeviceId`, `clientKey`, and `userAgent` are posted and stored verbatim; owner downloads return the raw payload. | Not an access-control break, but it is a real privacy/fingerprinting concern for non-owner participants who opt into diagnostics. |

STATUS: BUGS — stale `blocked` latch creates a lying/stuck remote-audio banner; `selectedSpeakerUnavailable` leaks across calls
