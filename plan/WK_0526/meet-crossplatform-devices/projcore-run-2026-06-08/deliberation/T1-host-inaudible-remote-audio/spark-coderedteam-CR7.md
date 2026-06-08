# Spark Red-Team CR7

**STATUS: BUGS**

## Scope
CR7 (lens L7): state-machine exhaustiveness + full-lifecycle reset hygiene for in-room remote-audio registry and host audio UI banners.

## 1) Registry-entry state product — contradictions / stuck / lying banner states

### Remote-audio per-entry banner-state logic currently has inconsistent blocked signals

- In `remote-audio.service.ts`:
  - `remoteAudioBlockedReason(entry)` can return:
    - `sink-failed`, `playback-unsupported`, `voice-stalled`, `paused`, or `autoplay`.
  - `remoteAudioBlocked` (aggregate) only checks:
    - `entry.blocked || entry.voiceStalled || (entry.el.paused && !entry.playbackFailure)`.
- A non-null `remoteAudioBlockedReason` from `playbackFailure` (`unsupported` or `aborted`) does **not** always propagate into `remoteAudioBlocked`, because `entry.playbackFailure` is explicitly ignored by aggregate logic except via `paused`.
- Net result:
  - Registry can expose a concrete blocking reason while the banner state remains off (`remoteAudioBlocked === false`).
  - This is a “lying” state relative to the reason channel and can hide user-visible errors.

### `play()` failure semantics are not symmetric with blockage states

- `play()` catch path currently sets:
  - `entry.blocked = playbackFailure === null`
  - `entry.playbackFailure = classifyPlaybackFailure(err)`
- If `err` is `NotSupportedError`, `playbackFailure` becomes `'unsupported'` and `entry.blocked` stays `false`, reinforcing the divergence above.
- If `err` is `AbortError`, `playbackFailure` becomes `'aborted'`; aggregate blocked also remains false, even though UX should likely treat this as blocked/needs user action in this flow.

### Replay/add flow does not close the gap

- `replayRegistryElements()` and add/readd logic reuse the same `playbackFailure`→`blocked` assignment pattern, so unsupported/aborted remains uncoupled from the aggregate banner signal during subsequent replays.

### Result for banner exhaustiveness

- This state machine is not exhaustive in `remoteAudioBlocked`: it does not include all blocking-reason branches used by `remoteAudioBlockedReason`, so blocked semantics are incomplete.

## 2) Full-lifecycle stale-state audit (CR2 ‘unlocked’ class focus)

## Per-entry fields

### `blocked`
- Lifecycle behavior: per-entry boolean is initialized on creation and updated on play/replay paths; entries are removed from registry on peer removal / reset flows.
- Stale leak risk across calls: **low** (bounded by registry lifecycle).

### `playbackFailure`
- Set in `play` error handler (`'unsupported'`, `'aborted'`, or `null`).
- Not part of full-call global reset directly, but entry-specific cleanup/removal is performed when registry is cleared.
- Audit issue: can remain semantically active while not forcing aggregate block; this is a logic leak into banner representation, not necessarily registry persistence.

### `voiceStalled`
- Lifecycle updates occur on `ontimeupdate`/`canplay` monitoring, and it participates in aggregate block logic.
- Stale behavior: depends on tracker timers and handler cleanup by entry lifecycle; no obvious cross-call residue observed.

### `sinkApplyResult` and `sinkApplyTimedOut`
- Contribute to `remoteAudioBlockedReason` via `sink-failed` branch.
- If these are set for a given entry and the entry is not removed when it should be, it can overstate reason; registry add/remove paths still clear through removal.
- Main issue here is still the partial visibility model in aggregate block.

### `sinkId`, `el`, and other transport/audio-element references
- Scoped to entries and replaced/removed with peer lifecycle events.
- No persistent cross-call leakage observed beyond standard registry replacement behavior.

## Service-wide fields

### `unlocked`  
- CR2 target was explicitly checked.
- `remote-audio.service.reset()` sets `unlocked = false`.
- `cleanupCall()` path in room invokes `remoteAudio.reset()`.
- Verdict: **reset hygiene is correct for `unlocked` in service layer**.

### `selectedSinkId`, `effectiveSinkId`, `usedDefaultSinkFallback`
- Reset in `remote-audio.service.reset()`.
- Cross-call leakage risk: **low**.

### `mutedAll`, `contextState`, `outputPlaying`, `remoteAudioBlocked`
- Reset in service `reset()` and synchronized from service reads in room effects.
- Risk is mostly state fanout timing, not stale persistent storage after reset.

## Room component fields with stale-call effect (outside service)

### `selectedSpeakerUnavailable` (**high-confidence bug**)
- This banner/state is not reset in `cleanupCall()`.
- It is a per-call UI state with no guaranteed clear for the next session unless another device-selection path updates it.
- This can persist between calls, producing stale banner semantics after call transitions.
- This is a lifecycle hygiene gap not covered by service `reset()`.

### `remoteAudioBlocked` local mirror
- Mirror is refreshed on multiple effects and reset flows; not obvious that it remains poisoned after call.
- Secondary concern remains: it mirrors aggregate semantics from service, which are incomplete (see section 1).

## 3) Exhaustive verdict

### Bugs (ranked)

1. **CRITICAL: aggregate banner-state non-exhaustiveness** (`remote-audio.service.ts`)
   - `remoteAudioBlockedReason` includes failure branches not represented in `remoteAudioBlocked`.
   - Enables reasoned failure state without user-facing banner.

2. **HIGH: unsupported/aborted playback failure mapped to no user block** (`remote-audio.service.ts`)
   - `play()` and replay flows set `entry.blocked` only when `playbackFailure === null`.
   - Leaves `remoteAudioBlocked=false` while failure reason exists.

3. **HIGH: per-call stale banner state not fully reset** (`room.page.ts`)
   - `selectedSpeakerUnavailable` is not reset in `cleanupCall()`.
   - Can leak stale UI condition into next call lifecycle.

### No-issue items

- `unlocked` no stale leak across calls via service reset + call-cycle cleanup.
- Core registry structural teardown paths (`clearRegistry`, `removePublisher`, `closeLiveTracksForExit`) are broadly called and prevent persistent per-entry object retention in the normal in/out path.

## 4) Minimal required fixes (non-exhaustive)

- Include `entry.playbackFailure` (or explicit `playbackFailure` branches) in aggregate blocked conditions.
- Keep banner/state reasoning exhaustive by aligning all `remoteAudioBlockedReason` branches with `remoteAudioBlocked`.
- Reset `selectedSpeakerUnavailable` in `cleanupCall()` (or central call-exit state initializer).
