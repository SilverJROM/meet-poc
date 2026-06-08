# spark CODE red-team CR5

## Findings by probe (1-7)
- Probe 1 — setSinkId-unsupported browsers: **OK**
  - In browsers without `setSinkId`, `applyMediaElementSinkWithDefaultFallback()` returns `'selected'` (no throw), so add/play continues on default routing (`frontend/src/app/services/remote-audio.service.ts:134-156`).
  - Sink selection failures are only surfaced where appropriate, and the selected speaker/diagnostics state is not falsely marked unavailable in that unsupported path (`frontend/src/app/pages/room/room.page.ts:3911-3920`, `2622-2632`, `1014-1022`).

- Probe 2 — Garbage/missing RTCStats (`NaN`/missing/negative/huge): **OK**
  - RTCP stat ingestion always normalizes to `null` when values are non-finite (`frontend/src/app/services/sfu-client.service.ts:1876-1878`), including media-playout fields (`:760-774`, `:1885-1894`).
  - `remoteVoiceSample()` discards tracks with missing/non-finite `bytesReceived` or `jitterBufferEmittedCount`, preventing NaN/invalid arithmetic from entering recovery decisions (`frontend/src/app/pages/room/room.page.ts:3915-3921`).
  - Energy/level guard in recovery scoring ignores `NaN`/`Infinity` and accepts only finite samples (`frontend/src/app/services/remote-audio.service.ts:105-120`).

- Probe 3 — Autoplay variants / `play()` rejection variants / pending interaction: **OK**
  - Gesture unlock and keepalive/recovery both funnel through `replayRegistryElements()` which marks blocked state from actual `play()` outcomes and retries (`frontend/src/app/pages/room/room.page.ts:2646-2660`, `2670-2675`, `530-553`).
  - Error-class distinctions are not surfaced in a separate user-visible channel yet, but the current logic consistently routes rejections to blocked/recovery state and replays (`frontend/src/app/services/remote-audio.service.ts:530-553`, `535-550`).

- Probe 4 — Weird device enumeration (`devicechange` storms / duplicates / empty/stale IDs): **OK**
  - Output IDs are reapplied on devicechange and recoveries run on blocked state; stale or missing selected outputs resolve to fallback behavior through sink routing and recovery (`frontend/src/app/pages/room/room.page.ts:2620-2632`, `2670-2675`).
  - Duplicate/empty selected output IDs are handled conservatively: empty ID only gets defaulted via `preferredDeviceId` when unset, while explicit IDs are still attempted and handled as failed/default-fallback as applicable (`frontend/src/app/pages/room/room.page.ts:2348-2351`, `2680-2687`, `3911-3913`, `121-155`).

- Probe 5 — Degenerate streams (0 tracks, ended track, ended-at-add time, ended stream): **BUG**
  - `currentAudioTrack()` falls back to `tracks[0]` even if ended, so `syncPeers()` can feed `addPublisher()` an already-ended track when all tracks for a peer are ended (`frontend/src/app/services/remote-audio.service.ts:594-597`, `frontend/src/app/pages/room/room.page.ts:262-278`).
  - If that ended track has already fired `ended`, the cleanup listener added in `addPublisher()` can miss triggering (`track.addEventListener('ended', ...,{once:true})`), leaving a registry entry alive but permanently `blocked` after `play()` rejects (`frontend/src/app/services/remote-audio.service.ts:428-460`, `453-470`).
  - Result: stuck `blocked`/banner for dead streams instead of skipping source and keeping playout healthy.

- Probe 6 — Diagnostics payload robustness (old rows missing new fields): **OK**
  - New `remoteAudioPlayout`/`mediaPlayout` consumers default safely when field is missing (`frontend/src/app/pages/diagnostics/diagnostics.page.ts:27-50`, `111-140`, `142-148`, `527-537`, `535-537`).
  - Remote diagnostics rendering paths are gated (`?.`, defaults, null checks) and do not dereference missing new fields (`frontend/src/app/pages/diagnostics/diagnostics.page.ts:503-537`, `536-157`).

- Probe 7 — Anything prior lenses + coordinator missed: **OK**
  - No additional regressions surfaced in this lens beyond the ended-track path above; existing non-convergence in other areas should be tracked in their owning lens if still relevant (`frontend/src/app/services/sfu-client.service.ts:1748-1758`).

## NEW bugs
| Severity | file:line | what | fix |
|---|---|---|---|
| P2 | `frontend/src/app/services/remote-audio.service.ts:594-597`, `frontend/src/app/pages/room/room.page.ts:262-277`, `frontend/src/app/services/remote-audio.service.ts:428-460` | Ended tracks are treated as valid playback candidates and can be registered with `addPublisher()` via `currentAudioTrack()` fallback, then remain blocked/stuck because end-of-track cleanup may not trigger on already-ended tracks. | Skip ended tracks in `currentAudioTrack()` instead of falling back to them; treat peer with only ended tracks as no audio-track source, and/or add immediate cleanup/retry when `track.readyState === 'ended'` before creating registry elements. |

STATUS: BUGS — stale ended-track sinks can keep per-peer remote playout blocked.
