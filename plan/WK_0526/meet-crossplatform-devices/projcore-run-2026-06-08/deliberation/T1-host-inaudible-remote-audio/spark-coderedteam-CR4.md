# spark CODE red-team CR4

## Concurrency/race findings
- PASS for addPublisher/syncPeers race safety against the requested JROM churn.
  - `syncPeers()` guards no-op when not in call, removes departed peers first, and only calls `addPublisher()` when stream/track identity changes (`frontend/src/app/services/remote-audio.service.ts:244-262`).
  - `addPublisher()` immediately `removePublisher(id)` before async work, then marks each pending element with `generation` and checks `isEntryCurrent()` both after `setSinkId` and after `play()` (`frontend/src/app/services/remote-audio.service.ts:403-451`, `470-523`).
  - `setInCallActive(false)` / `reset()` both bump `generation` and clear registry, so mid-add callbacks from prior call are invalidated (`frontend/src/app/services/remote-audio.service.ts:356-358`, `387-401`).
- No deterministic double-element/orphan element was found in the exact sequence host + 2 talkers + leave/rejoin.
- The one material concurrency gap I could exercise is a potential stale warning set growth (tracked below) because it is state in SFU signaling, not in audio element lifecycle.

## Leak findings
- `RemoteAudio` elements are removed on all ordinary teardown paths:
  - explicit per-publisher `removePublisher()` (`frontend/src/app/services/remote-audio.service.ts:470-478`)
  - per-call churn `clearRegistry()` (`remote-audio.service.ts:479-482`)
  - `stop/reset`/`setInCallActive(false)` paths (`remote-audio.service.ts:356-362`, `387-401`)
  - listeners are detached in `destroyRegistryElement()` (`remote-audio.service.ts:529-537`).
- `remoteVoiceWatchdogPeers` is bounded by active inbound peers, cleared on timer stop, and pruned when peers disappear from diagnostics (`frontend/src/app/pages/room/room.page.ts:2691-2742`).
- `micSilenceWindow` is bounded (`MIC_SILENCE_WATCHDOG_WINDOW`-length sliding window) and reset on stop/state exits (`frontend/src/app/pages/room/room.page.ts:3278-3330`).
- BUG: `subscribeMidConflictWarnings` can grow unbounded over long churn because entries are ever only added, never cleared (`frontend/src/app/services/sfu-client.service.ts:1744-1747`, `97` and no `.clear()`/delete call sites).

## JROM-scenario trace: host + non-default sink + 2 talkers + churn
1. Host in call, selected output non-default -> `room.page` writes `selectedAudioOutputId` and `changeAudioOutputDevice` sets selected state; `RemoteAudioService.selectedSinkId` is updated and existing elements are `applyOutputDevice()`-applied if any.
2. Publisher A joins (`peers` update): `remoteAudio.syncPeers()` sees A, calls `addPublisher(A)`; element is created, sink-annotated with selected output before `play()`, then appended to `document.body`.
3. Publisher B joins: same path in parallel; both have independent registry entries so both should be audible through same selected sink.
4. A mute/unmute (track not swapped): `syncPeers()` sees same `stream/track` identity and skips re-add, so host keeps playing with existing element; mute is expected at RTP/track audio layer only.
5. B leaves: `syncPeers()` no longer sees B and invokes `removePublisher(B)`, which removes the DOM element and detaches listeners.
6. B rejoins: new `addPublisher(B)` creates a fresh element under the current `selectedSinkId`; prior in-flight add/remove states are invalidated by `generation` checks, so no orphan/stale element can survive.
7. Net result in current code: no expected audible-breakpoint in this exact JROM flow unless selected sink is unsupported/removed.
8. Mid-call sink hot-unplug: `handleDeviceChange()` refreshes devices, effect-driven re-apply/recover calls `applySpeakerDevice()` and then `recoverPlayback()` when needed; `applyMediaElementSinkWithDefaultFallback` ensures default fallback if selected fails (`frontend/src/app/pages/room/room.page.ts:2616-2632`, `2622-2632`, `remote-audio.service.ts:120-138`). If both sink attempts fail, `remoteAudioBlocked` is raised via failed output application in `remote-audio.service.ts:499-503`.

## NEW bugs
| Severity | file:line | what | evidence |
|---|---|---|---|
| P2 | `frontend/src/app/services/sfu-client.service.ts:1744-1747` | `subscribeMidConflictWarnings` is never pruned (no global clear, no per-client prune), so repeated subscribe conflicts over long/churny sessions can accumulate indefinitely. | Set-only logic exists on warning emission (`add`) but no delete/clear sites. |

STATUS: BUGS — map-growth leak risk in long/churny calls via `subscribeMidConflictWarnings`.
