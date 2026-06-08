# gpt54 CODE red-team CR1
## Bugs found

| severity | file:line | what breaks | fix |
|---|---|---|---|
| high | `frontend/src/app/services/remote-audio.service.ts:483-505`, `frontend/src/app/services/remote-audio.service.ts:528-534`, `frontend/src/app/pages/room/room.page.ts:638-663`, `frontend/src/app/pages/room/room.page.ts:2742-2779` | Silent-no-banner still exists for the exact “decode/sink stalled but `play()` resolved” class. `remoteAudioBlocked` only reflects `entry.blocked || entry.el.paused`, and replay only flips `blocked` on sink failure or `play()` rejection. The watchdog already detects `bytesReceived` climbing while `jitterBufferEmittedCount` stays flat, but it only retries replay; it never latches banner state. Result: a live remote publisher can remain inaudible while `remoteAudioBlocked()` stays `false`, so the unblock banner never appears. | When the watchdog reaches the “bytes rising / emitted flat” condition, surface a blocked state that the room banner consumes, and clear it only after playout evidence recovers. Do not rely on `paused`/`play()` success alone for banner truth. |
| medium-high | `frontend/src/app/services/sfu-client.service.ts:823-847`, `frontend/src/app/services/sfu-client.service.ts:1739-1758`, `frontend/src/app/services/sfu-client.service.ts:1777-1792` | Subscribe rollback is incomplete after `flushPendingOntrack()`. In the renegotiation path, tracks are injected into `remoteStreams`/`remoteScreenStreams` before `createAnswer`/`setLocalDescription`/`PUT /renegotiate` finish. If any later await fails, rollback restores `midToEntry`/`subscribedTracks`/timers only; it never removes the already-added tracks/streams. That leaves ghost remote streams from a failed subscribe and can compound into duplicate tracks on retry. | Extend rollback to snapshot and restore `remoteStreams`/`remoteScreenStreams` (or defer `flushPendingOntrack()` until after renegotiation commits). |
| medium | `frontend/src/app/pages/diagnostics/diagnostics.page.ts:100-118` | The new “Remote audio playout” table presents global `mediaPlayout` stats as if they were per-publisher rows. Every publisher row gets the same `audioLevel`/`totalAudioEnergy`/`totalSamplesDuration`, so the UI cannot actually prove which publisher decoded/played out and can mislead triage on multi-talker calls. | Either label these values as call-wide playout metrics outside the per-publisher loop, or collect/display true per-publisher evidence only. |

## Regressions from the mixer removal

- The unblock banner logic regressed from “mixer truth” to “HTMLMediaElement paused/play rejection truth.” That narrows detection and re-opens a silent-live path even though the watchdog sees stalled playout.
- I did not find a separate broken reference to removed mixer graph nodes in the reviewed files. The main regression is state truth, not a dangling symbol.

## Silent-no-banner paths in the CODE

- `remoteAudioBlocked` is derived only from `entry.blocked || entry.el.paused` in `refreshBlockedState()` (`remote-audio.service.ts:528-534`).
- `entry.blocked` becomes `true` only on sink failure, pause/end/error, or `play()` rejection (`remote-audio.service.ts:423-450`, `483-505`).
- The room banner simply mirrors that signal (`room.page.ts:638-663`).
- The voice watchdog can detect “network bytes still arriving but playout emitted count flat” (`room.page.ts:2742-2779`) yet never marks the banner blocked; it only replays. If replay keeps resolving `play()` without emitted audio recovering, the host stays silent with no banner.

## Test adequacy gaps

- `frontend/src/app/services/remote-audio.service.spec.ts:243-343` only covers sink-before-play, mute/volume, reset, late join, simple paused-state replay, re-add dedup, and volume migration.
- There is no test for the real silent-live failure mode: inbound bytes increase, emitted count stays flat, replay attempts happen, and the banner must become visible.
- There is no test for `syncPeers()` replacing a publisher when the audio track changes mid-call on the same `MediaStream`.
- There is no test for the SFU rollback bug where `flushPendingOntrack()` mutates `remoteStreams` before renegotiation later fails.
- There is no test asserting diagnostics semantics for per-publisher playout rows versus call-wide `mediaPlayout`.

STATUS: BUGS — silent remote audio can still persist with `remoteAudioBlocked=false`, so the host can hear nothing and never get the unblock banner
