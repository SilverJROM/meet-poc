# gpt54 verdict — T1 round 6
## Q1 — B13-B16 each: correct&sufficient? (gaps file:line)
- `B13 no autoplay attr`: `correct and necessary`, but not fully sufficient by itself.
  The current tile element has `autoplay` at [tile.component.html:15](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.html:15), and the current effect plays immediately after `srcObject` attach at [tile.component.ts:60-63](/home/agjrom/websites/meet-poc/frontend/src/app/components/tile/tile.component.ts:60). Removing native `autoplay` is the right fix to prevent first frames reaching the default device before `setSinkId`. I do not see a code-grounded path where `srcObject` assignment alone auto-plays without `autoplay` or explicit `play()`. The real sufficiency condition is the ordered service-owned sequence in Q2.

- `B14 clearRegistry in reset`: `directionally correct, not yet sufficient`.
  `reset()` currently tears down only mixer state at [remote-audio.service.ts:444-462](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:444). Adding `clearRegistry()` first is necessary, but design v2 does not handle an in-flight async `addPublisher()` that is awaiting `setSinkId()` / `play()` and can still append/store an element after `reset()` completes. This is the top remaining gap. The correct fix is an epoch/disposed token:
  every async `addPublisher()` captures the current registry generation;
  `reset()/clearRegistry()` increments generation and marks disposed;
  after each await, `addPublisher()` aborts if generation changed, then pauses/nulls/removes the transient element instead of appending.

- `B15 volume migration`: `correct and sufficient if persisted value is rewritten`.
  Stored volume is read raw at [remote-audio.service.ts:669-676](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:669), clamped to `MAX_VOLUME=1.3` at [remote-audio.service.ts:49-50](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:49) and [remote-audio.service.ts:200-205](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:200). Under Option A, playback caps at `1.0`, so migration to `min(parsed,1)` plus persisting the clamped value is the right fix. It is safe for first run/no stored value because `readStoredVolume()` already falls back to `DEFAULT_VOLUME` when absent or invalid [remote-audio.service.ts:671-676](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:671).

- `B16 diagnostics payload`: `mostly correct, but cannot by itself prove physically audible sound`.
  Adding playout payload beside diagnostics build at [room.page.ts:3498-3525](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:3498) and extending the SFU collector beyond current `inbound-rtp` fields at [sfu-client.service.ts:728-780](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:728) is the right direction. The single field set that best proves “decoded and delivered to the selected sink” is:
  `selectedAudioOutputId`,
  per-publisher `sinkId === selectedAudioOutputId || '' fallback recorded`,
  `srcObjectAttached`,
  `paused === false`,
  `readyState >= HAVE_CURRENT_DATA`,
  and `media-playout.audioLevel > 0` plus `totalAudioEnergy` climbing.
  That proves decoded-and-playing to the chosen element/sink route. It still cannot prove the OS/device actually emitted audible sound if the OS itself is muted/exclusive-switched, but that is outside the app’s original bug class.

## Q2 — contradiction check + the exact ordered addPublisher sequence
Internal contradiction check:
- `B1/B3/B9/B13` are compatible if there is one source of truth: `RemoteAudioService` owns `volume`, `mutedAll`, `selectedSinkId`, `unlocked`.
- `B1` and `setVolume/setMutedAll` do not conflict with `addPublisher`; `addPublisher` applies current state once at creation, while `setVolume/setMutedAll` update all registered elements thereafter.
- `B8` must stop depending on `hasSources()` / `contextState` because current room recovery still does that at [room.page.ts:2685-2688](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2685). If this is not rewritten, design v2 contradicts itself by removing the mixer but preserving mixer-gated banner logic.

Exact ordered `addPublisher` sequence that satisfies `B1+B3+B9+B13` with no race:
1. If registry already has `publisherClientId`, synchronously `removePublisher(id)` or atomically replace the prior entry before continuing.
2. Create detached `HTMLAudioElement`.
3. Set `playsinline`; do **not** set `autoplay`.
4. Set stable diagnostics/recovery attributes: `data-remote-audio`, `data-peer-id`, `data-track-id` if available.
5. Set `srcObject = stream`.
6. Compute `effectiveVolume = mutedAll ? 0 : min(volume, 1)`.
7. Set `el.volume = effectiveVolume`.
8. Set `el.muted = mutedAll`.
9. Capture current registry generation / dispose token.
10. `await setSinkId(selectedSinkId)` using default-fallback helper.
11. Abort if generation/disposed changed; if so, `pause`, `srcObject = null`, `remove`, return.
12. Append element to DOM.
13. Store `{stream, el}` in registry map.
14. If `unlocked === true`, `await el.play()`.
15. On `play()` reject: keep entry registered, mark this publisher blocked, raise `remoteAudioBlocked`.
16. On success: clear blocked state for that publisher.

The important order constraints are:
- `srcObject`, `volume`, `muted`, and `sinkId` all happen before `play()`.
- DOM append happens before the final `play()` call so the service does not depend on detached-element behavior.
- Registry store happens before `play()` rejection handling so recovery paths can find the element.

## Q3 — silence-hunt table: [path | banner? | auto-recovery? | SILENT-NO-BANNER blocker?]
| path | banner? | auto-recovery? | SILENT-NO-BANNER blocker? |
| --- | --- | --- | --- |
| Remote publisher joins before first host gesture; autoplay blocked | `Yes`, if B8 is rewritten to use registry blocked elements instead of mixer `hasSources` [room.page.ts:650-659](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:650) | `Yes`, first click via `unlockAll()` / interaction recovery [room.page.ts:2799-2818](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2799), [remote-audio.service.ts:282-292](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:282) | `No` if B8 lands |
| Late joiner after host already gestured once | `No` in healthy case | `N/A`, should play immediately with sticky `unlocked` | `No` |
| All join before any gesture | `Yes` | `Yes`, first real gesture replays all | `No` |
| Host backgrounds/resumes; existing elements pause/throttle | `Maybe no banner if auto-recovery succeeds fast; yes if not` | `Yes`, visibility recovery calls `recoverRemoteAudio('visibility')` [room.page.ts:2876-2879](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2876) and pageshow resume calls it again [room.page.ts:2852-2857](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2852) | `No`, assuming B7 rewrites registry replay |
| New publisher joins after background/resume | `No` if sticky unlock preserved; otherwise `Yes` | `Yes`, sticky unlock or next interaction recovery | `No` if sticky unlock state survives resume |
| Selected output device unplugged / becomes invalid mid-call | `Usually no banner if fallback to default succeeds; yes if replay stays blocked` | `Yes`, current device refresh can clear invalid selected id [room.page.ts:2367-2368](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2367) and `applySpeakerDevice('')` fallback path exists [room.page.ts:1039-1042](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:1039) | `No` at app level; route may change but not silently stay dead if fallback is handled |
| Bluetooth / OS output handoff changes audible route outside app | `No app banner necessarily` | `Limited`; app can reapply sink on devicechange/interaction | `No app-level blocker`; this is OS/device behavior, not the original app bug class |
| Remote publishers are actually muted / sending silence | `No`, because element can be playing correctly | `No recovery needed` | `No`; not an app playout bug |
| Publisher sends non-decodable / never-decoding track | `Should yes`, if diagnostics/watchdog mark blocked despite bytes or absent media-playout energy | `Limited`; replay won’t fix remote bad media | `No`, if blocked state is surfaced; otherwise this becomes a B8 diagnostic/UI bug |
| `setSinkId` succeeds but OS/device itself is muted/exclusive | `No app banner` | `No app recovery` | `No` for this investigation; outside app-owned fault domain |
| Async `addPublisher()` completes after `reset()/cleanupCall()` and appends a stale element from prior session | `Likely no banner` because stale element may not be tracked in fresh call state | `No reliable auto-recovery` | **`Yes — remaining blocker`**. This is the one remaining plausible silent-no-banner path in design v2 unless B14 gains generation/cancellation. |

Summary of the silence hunt:
- After B13-B16, most remaining silence paths are either bannered-and-recoverable or outside the app’s responsibility.
- The remaining original-bug-class path is the async teardown race: stale service-owned elements created after reset can bypass fresh-call blocked-state accounting and recreate silent/no-indicator behavior.

## Q4 — new item(s) OR "NO NEW ISSUE — design v2 complete"
New item:
- `Async addPublisher vs reset generation race` is still not concretely closed by design v2. B14 adds ordered `clearRegistry()`, but not cancellation/epoch invalidation for in-flight async publisher creation. This is not a nit; it is the last credible `SILENT-NO-BANNER` blocker still visible in the design.

STATUS: REVISE — design v2 is close, but B14 needs an explicit generation/cancellation guard for in-flight addPublisher or a stale post-reset element can still recreate silent-no-banner failure.
