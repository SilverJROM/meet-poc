# spark CODE red-team CR1
## Bugs found
| severity | file:line | what breaks | fix |
|---|---|---|---|
| MEDIUM | `frontend/src/app/services/remote-audio.service.ts:370-379` | `RemoteAudioService.reset()` clears registry and state maps but does not clear `this.unlocked`, so once any remote audio element is unlocked on a previous call, later calls inherit stale `unlocked: true` in diagnostics and recovery paths (e.g., `playoutDiagnostics()`) can attribute inaudibility to non-lock reasons. This directly weakens the decode-vs-sink forensic signal required by the ticket. | In `reset()`, explicitly set `this.unlocked = false` (and reset sink tracking like `selectedSinkId` if meant to be per-call). Ensure this is done together with full peer registry teardown. |

## Regressions from the mixer removal
- `frontend/src/app/pages/room/room.page.ts:265` still defines `remoteAudioMixer` ViewChild and `frontend/src/app/pages/room/room.page.ts:632-633` still calls `this.remoteAudioService.attachOutputElement(this.remoteAudioMixer?.nativeElement)` despite no mixer element in the new registry-only model. This is now dead wiring (and no-op, unless template contains an element in another branch). It is a non-fatal confusion/risk signal, not a proven runtime break in the current path.
- `frontend/src/app/components/tile/tile.component.ts`/`controls-bar` changes are consistent with v2.2 registry flow and did not show functional regressions in the read code.

## Silent-no-banner paths in the CODE
- None confirmed in the current code path. I found no direct path where `remoteAudioBlocked` is kept false while a live publisher remains inaudible after transport/publisher attachment in `addPublisher`/`syncPeers`/recovery hooks.

## Test adequacy gaps
- There is no test validating service lifecycle reset hygiene for cross-session diagnostics fields (`unlocked`, `selectedSinkId`, prior sink id state) after `disconnect()`/`leave()` transitions, even though this directly affects false-inference in diagnostics.
- Diagnostics tests cover structure and some happy-path behavior, but they do not currently assert stale-unlocked leakage across session boundaries (the regression above).

STATUS: BUGS — `RemoteAudioService.reset()` leaves `unlocked` true across sessions, causing stale `playoutDiagnostics.unlocked` values and weakening inaudibility triage after call boundaries.
