# codex55 CODE red-team CR7 (lens L7: state-machine + lifecycle)

## State-machine: any contradictory/stuck/lying combination?

Not fully consistent.

I enumerated the registry-entry state product by the actual reducer precedence:

`remoteAudioBlocked = any(entry.blocked || entry.voiceStalled || (entry.el.paused && !entry.playbackFailure))` at `frontend/src/app/services/remote-audio.service.ts:622`.

`blockedReason = sink failed/timed out -> playback unsupported -> voice stalled -> paused-without-playbackFailure -> blocked/autoplay -> null` at `frontend/src/app/services/remote-audio.service.ts:640`.

Reachable collapsed states:

| Entry projection | Service projection | Banner / blocked state | Reason | Consistency |
|---|---|---:|---|---|
| `blocked=true`, any `paused`, no higher sink/playback/stall reason | any `unlocked`, any `mutedAll` | blocked | `autoplay` or higher-precedence reason | consistent |
| `voiceStalled=true`, `mutedAll=false` | any `unlocked` | blocked | `voice-stalled` unless sink/playback reason wins | consistent enough; sink-failed precedence can hide stall cause |
| `voiceStalled=true`, then `mutedAll=true` | `mutedAll=true` | clears on transition | none after `setMutedAll(true)` clears stalls at `remote-audio.service.ts:240` | consistent |
| `paused=true`, `playbackFailure=null` | any service state | blocked | `paused` | consistent |
| `playbackFailure='unsupported'`, usually `paused=true`, `blocked=false` | any service state | not blocked | `playback-unsupported` | intentionally no tap-to-enable banner; diagnostics reason is non-null while `blockedPeerIds` excludes it |
| `playbackFailure='aborted'`, usually `paused=true`, `blocked=false` | any service state | not blocked because `!!playbackFailure` suppresses paused | `null` | potentially opaque but bounded; aborted is not treated as a user-action block |
| `sinkApplyResult='default-fallback'` or `'unsupported'`, `sinkApplyTimedOut=false`, play succeeds | any service state | not blocked | `null` | consistent: audible on default/effective fallback, with fallback tracked separately |
| `sinkApplyResult='failed'` or `sinkApplyTimedOut=true`, play still succeeds | any service state | not blocked | `sink-failed` | **BUG/contradiction**: diagnostics says blocked reason `sink-failed` while banner is clear and `blockedPeerIds` excludes the peer |
| `sinkApplyResult='failed'` or `sinkApplyTimedOut=true`, play fails with NotAllowed/unknown | any service state | blocked | `sink-failed` | consistent, though sink reason hides autoplay |
| no entries | any service state | not blocked | no rows | consistent |

The contradictory reachable class is created because sink failure/timeout sets `entry.blocked=true` at `remote-audio.service.ts:494` and `remote-audio.service.ts:575`, but the later successful `el.play()` path unconditionally clears `entry.blocked=false` at `remote-audio.service.ts:521` and `remote-audio.service.ts:588` without clearing `sinkApplyResult='failed'` / `sinkApplyTimedOut=true`. `refreshBlockedState()` then clears the banner using `blocked=false`, while `remoteAudioBlockedReason()` still reports `sink-failed`.

This can make the diagnostics row internally lie: `blockedReason='sink-failed'` with `remoteAudioBlocked=false` and the publisher absent from `blockedPeerIds`.

## Reset hygiene: any field leaking stale state across calls?

Not all reset.

RemoteAudioService fields that reset synchronously: `unlocked`, `selectedSinkId`, `effectiveSinkId`, `usedDefaultSinkFallback`, `mutedAll`, registry entries, `remoteAudioBlocked`, `outputPlaying`, and voice recovery counters are reset at `frontend/src/app/services/remote-audio.service.ts:424`.

Registry lifecycle is mostly guarded: `addPublisher()` uses a generation and `isEntryCurrent()` before post-play mutation at `remote-audio.service.ts:510` and `remote-audio.service.ts:602`; `destroyRegistryElement()` pauses, nulls `srcObject`, removes listeners, and removes DOM at `remote-audio.service.ts:606`.

However, async sink completions can leak after reset:

| Field | Leak path | Evidence |
|---|---|---|
| `effectiveSinkId` | `reset()` clears it, but a pending `addPublisher()` sink apply can resolve after reset and call `updateSinkFallbackState()` before `isEntryCurrent()` is checked. | `remote-audio.service.ts:424`, `remote-audio.service.ts:494`, `remote-audio.service.ts:508`, current guard only at `remote-audio.service.ts:510` |
| `usedDefaultSinkFallback` | Same post-reset pending `addPublisher()` path can rewrite fallback state after reset. | `remote-audio.service.ts:430`, `remote-audio.service.ts:508`, `remote-audio.service.ts:556` |
| `effectiveSinkId` / `usedDefaultSinkFallback` | Pending `recoverPlayback()` / `unlockAndPlayRemoteSinks()` replay snapshots entries, awaits `applySinkId()`, then writes fallback state before checking `isEntryCurrent()`. A leave/reset during the await can be followed by a stale write into the next call's diagnostics. | `remote-audio.service.ts:284`, `remote-audio.service.ts:307`, `remote-audio.service.ts:569`, `remote-audio.service.ts:574`, `remote-audio.service.ts:583`, guard only at `remote-audio.service.ts:587` |
| `selectedSpeakerUnavailable` | Room-level flag is not reset in `cleanupCall()`. It is set true on missing/fallback output, but `refreshDevices()` does not clear it when a previously missing selected output is now present. A same-component rejoin can show "Selected speaker unavailable" from the prior call. | declared at `frontend/src/app/pages/room/room.page.ts:224`, set at `room.page.ts:1019`, `room.page.ts:1027`, `room.page.ts:2359`, `room.page.ts:2637`; cleanup omits it at `room.page.ts:2433` |

Other lifecycle fields audited:

| Field/class | Result |
|---|---|
| `volume` | intentionally persisted; not a leak |
| registry / `voiceStalled` per entry | reset/removed via `remoteAudio.reset()` and `clearRegistry()` |
| `remoteVoiceWatchdogPeers` | cleared on stop/leave and while muted at `room.page.ts:2715` and `room.page.ts:2730` |
| `micSilenceWindow` | cleared on stop and inactive mic paths at `room.page.ts:3326` and `room.page.ts:3344` |
| `subscribeMidConflictWarnings` | cleared in SFU teardown/recovery paths at `frontend/src/app/services/sfu-client.service.ts:534`, `sfu-client.service.ts:1589`, and `sfu-client.service.ts:1633` |
| SFU subscribe guards/permanent-stop state | `subscribedClientIds`, retry attempts, timers, mid maps, streams, track names, and subscribed tracks are cleared in `clearLocalTransportSessionState()`, `closeLiveTracksForExit()`, and `destroy()` |
| room `remoteAudioBlocked` | mirrored from service while in-call; service reset clears source state, but room signal itself is not directly reset in cleanup. It is overwritten on the next in-call effect, so I do not count this as a next-call leak. |

## Banner/blockedReason truth across transitions

Rapid mute -> unmute: mute clears `voiceStalled` and reapplies element volume/muted at `remote-audio.service.ts:240`; unmute restores volume and keeps the watchdog responsible for reasserting stalls. This is consistent.

Stall -> recover: `recoverVoicePlayout()` sets `voiceStalled=true` before remediation at `remote-audio.service.ts:313`; `noteVoiceEmissionAdvanced()` clears it at `remote-audio.service.ts:320`; non-stall watchdog paths clear it at `room.page.ts:2760`, `room.page.ts:2781`, and `room.page.ts:2809`. Consistent.

Fallback -> device returns: explicit apply of the selected device clears fallback state when result becomes `selected` at `remote-audio.service.ts:556`. Device-change recovery only runs in-call at `room.page.ts:2635`; lobby/stale `selectedSpeakerUnavailable` remains the leak above.

Unsupported browser: `applyMediaElementSinkWithDefaultFallback()` returns `unsupported` when selected sink routing cannot be applied at `remote-audio.service.ts:138`; fallback state records default effective output at `remote-audio.service.ts:559`. No tap-to-enable banner is correct if play succeeds.

## Diagnostics privacy / payload size

Non-owner read access is guarded owner-side: diagnostics list/detail/download require auth and owner-scoped lookup at `backend/src/modules/sessions/index.ts:115`, `backend/src/modules/sessions/index.ts:129`, and `backend/src/modules/sessions/index.ts:143`. I did not find a non-owner read leak.

Privacy concern remains: payloads sent/stored server-side contain raw `clientKey`, selected input/output/video device IDs, and remote playout sink IDs at `frontend/src/app/services/meeting-sessions.service.ts:377` and `frontend/src/app/services/remote-audio.service.ts:389`. The diagnostics UI redacts sink labels at `frontend/src/app/pages/diagnostics/diagnostics.page.ts:97`, but `diagnostics.json` returns raw stored entries. This is probably acceptable only if owner diagnostics are intended to include raw device identifiers.

Payload size looks bounded by peer/publisher count and one row per registered remote audio publisher; no oversize class found.

## NEW bugs

| Severity | Bug | Evidence | Impact |
|---|---|---|---|
| P1 | Async sink apply/replay can repopulate `effectiveSinkId` / `usedDefaultSinkFallback` after `reset()`, leaking stale per-call sink diagnostics into the next call. | `remote-audio.service.ts:424`, `remote-audio.service.ts:508`, `remote-audio.service.ts:583`, guards after writes at `remote-audio.service.ts:510` and `remote-audio.service.ts:587` | CR2-class lifecycle leak; next-call diagnostics can claim prior call's effective output/fallback. |
| P1 | Sink-failed/time-out state can be diagnostically contradictory after `play()` succeeds: banner clear, peer not blocked, but row `blockedReason='sink-failed'`. | `remote-audio.service.ts:494`, `remote-audio.service.ts:521`, `remote-audio.service.ts:622`, `remote-audio.service.ts:640` | State product has a reachable lying diagnostics combination. |
| P2 | `selectedSpeakerUnavailable` can persist across cleanup/rejoin because cleanup omits it and refresh does not clear it on available selected output. | `room.page.ts:224`, `room.page.ts:2354`, `room.page.ts:2433` | Next call can show stale selected-speaker-unavailable banner. |

STATUS: BUGS — async post-reset sink state leak + contradictory sink-failed diagnostics/banner state
