# spark CODE red-team CR9 (lens L9: privacy/perf/closure)

## Privacy/security of payload

OK for tenant boundary, but not redacted at field level.

- Owner-only READ is enforced: `GET /meeting-sessions/:sessionId/diagnostics*` uses `auth` + `getDiagnosticsForSession(authed.user.email, ...)`, so non-owner sessions are rejected (`backend/src/modules/sessions/index.ts:129-136`, `backend/src/modules/sessions/index.ts:143-153`, `backend/src/modules/sessions/store.ts:466-478`).
- Owner-only write is effectively enforced by admission proof and active live-room membership via `isAdmittedDiagnosticPoster` (`backend/src/modules/sessions/index.ts:155-166`, `backend/src/modules/signaling/index.ts:507-537`).
- New fields are still stored raw in `payload_json` via the lenient normalizer (no redaction / allowlist enforcement) (`backend/src/modules/sessions/store.ts:481-488`, `backend/src/modules/sessions/store.ts:254-283`).
- New per-publisher + output-device data in the payload is therefore visible to the session owner: `selectedAudioOutputId`, `remoteAudioPlayout.perPublisher[].sinkId`, `trackId`, `trackName`, plus advertised remote manifest data (`frontend/src/app/pages/room/room.page.ts:3525-3552`, `frontend/src/app/pages/room/room.page.ts:3558-3573`, `frontend/src/app/services/meeting-sessions.service.ts:356-374`, `355-375`).
- This is acceptable against the current contract because it stays owner-scoped, but it does **not** satisfy a stricter “redact device-id/IP always” policy if that is later required.

## Perf-at-scale (5–10 publishers)

No n² loops or per-peer nested DOM scans were found in the critical path.

- Registry operations are linear in connected publishers: `syncPeers` (`O(n)`), `applyOutputDevice` (`Promise.all` over registry), `replayRegistryElements` (`O(n)`), `refreshBlockedState` (`O(n)`), and `playoutDiagnostics` (`O(n)`) (`frontend/src/app/services/remote-audio.service.ts:258-281`, `258-281`; `294-313`; `577-607`; `630-637`; `397-423`).
- Output reroute on device change is `O(n)` per remote publisher plus one local media-element scan that excludes remote audio by selector (`video, audio:not([data-remote-audio])`) and then delegates remote entries to `applyOutputDevice` (`frontend/src/app/pages/room/room.page.ts:669-682`, `2647-2658`).
- `syncPeers` is triggered by peer state changes in-call (`frontend/src/app/pages/room/room.page.ts:644-666`, `636`) and removes/creates at most one element per peer (`frontend/src/app/services/remote-audio.service.ts:450-500`).
- No hard payload-size cap was found for diagnostics JSON body growth besides natural track/publisher cardinality (`frontend/src/app/pages/room/room.page.ts:3517-3552`, `backend/src/modules/sessions/store.ts:254-333`).

## FINAL closure for exact JROM scenario

For the scenario in R1/R2/R3 (host with non-default speaker; 2 US publishers; RTP present; no banner), current behavior now follows a per-publisher `<audio>` playout model with direct `setSinkId` + playback telemetry, which is aligned with the fix intent:

- The host’s peers are synchronized into remote-audio registry entries per publisher (`frontend/src/app/pages/room/room.page.ts:636`; `frontend/src/app/services/remote-audio.service.ts:258-281`).
- Each entry is an actual `<audio data-remote-audio>` element with `setSinkId` applied and `play()` attempted (`frontend/src/app/services/remote-audio.service.ts:454-463`; `502-505`; `523-540`).
- Each diagnostic upload includes both `peers` manifest + `remoteAudioPlayout` so missing-output failure can be localized to subscription/decode/playback-routing (`frontend/src/app/pages/room/room.page.ts:3517-3552`; `frontend/src/app/services/meeting-sessions.service.ts:355-374`).
- Banner logic still keys off remote audio blocked state driven by registry reasons in-room, so the old “silent w/o any banner” symptom path has materially narrowed (`frontend/src/app/services/remote-audio.service.ts:348-350`, `630-637`; `frontend/src/app/pages/room/room.page.ts:644-658`).

Residual risk for exact closure:
- `remoteAudioBlockingReason()` returns `null` when `playbackFailure` is set (`frontend/src/app/services/remote-audio.service.ts:648-653`), and callers set `entry.blocked = playbackFailure === null` on play rejection (`frontend/src/app/services/remote-audio.service.ts:536-539`, `598-603`). This can leave a failed playback attempt without a blocked reason, so there is still a narrow path where host can receive RTP and perceive no audible output with weak/noisy diagnostics.

So the main root cause looks addressed, but this residual prevents the “honest diagnostics” closure from being fully airtight.

## NEW bugs (table)

| severity | area | issue | file:line | notes |
|---|---|---|---|---|
| medium | diagnostics honesty / blocker visibility | play rejection with `unsupported`/`aborted` can produce `blockedReason = null` (and `blocked` can be false) | `frontend/src/app/services/remote-audio.service.ts:531-540`, `598-603`, `648-653` | This can mask per-publisher playback failures and weakens the “no banner / no diagnostic signal” guarantee in edge cases |

STATUS: BUGS — residual payload-redaction gap and playback-failure visibility gap keep L9 from being clean
