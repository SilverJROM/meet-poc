# codex55 CODE red-team CR3

## CR-fix-2 verify: latch-nonsticky / rollback-touched-only / energy-join

OK.

- **Latch non-sticky + energy-gated:** `recoverVoicePlayout()` sets `voiceStalled`, but it is cleared by `noteVoiceEmissionAdvanced()` and `clearVoiceStalls()` (`frontend/src/app/services/remote-audio.service.ts:285`, `frontend/src/app/services/remote-audio.service.ts:292`, `frontend/src/app/services/remote-audio.service.ts:296`). The watchdog clears stalls on muted-all, no inbound peer/peer removed, unusable sample, bytes-flat, and no-energy windows (`frontend/src/app/pages/room/room.page.ts:2708`, `frontend/src/app/pages/room/room.page.ts:2721`, `frontend/src/app/pages/room/room.page.ts:2738`, `frontend/src/app/pages/room/room.page.ts:2759`, `frontend/src/app/pages/room/room.page.ts:2771`). `decideVoiceRecovery()` requires the 4-sample window, bytes-up, emitted-flat, and `sampleWindowHasVoiceEnergy()` before any latch-setting recovery (`frontend/src/app/services/remote-audio.service.ts:70`, `frontend/src/app/services/remote-audio.service.ts:91`). I found no path that sets `voiceStalled` and cannot later clear.
- **Touched-only rollback:** failed subscribe rollback restores only `touchedMidEntries`, restores the target publisher's pre-subscribe stream/track-name snapshots, and leaves unrelated publishers alone (`frontend/src/app/services/sfu-client.service.ts:1716`, `frontend/src/app/services/sfu-client.service.ts:1721`, `frontend/src/app/services/sfu-client.service.ts:1766`). Live cross-publisher mid conflicts throw before overwrite, preserving the live publisher (`frontend/src/app/services/sfu-client.service.ts:1737`). Coverage includes failed rollback preserving unrelated concurrent stream + trackName metadata and live collision no-orphan (`frontend/src/app/services/sfu-client.spec.ts:1389`, `frontend/src/app/services/sfu-client.spec.ts:1563`).
- **TrackName join:** registry diagnostics carries SFU `trackName` from `remoteTrackNames` (`frontend/src/app/services/remote-audio.service.ts:239`, `frontend/src/app/services/remote-audio.service.ts:363`), and diagnostics joins inbound energy by `publisherClientId + trackName` before falling back by publisher (`frontend/src/app/pages/diagnostics/diagnostics.page.ts:110`). Coverage proves browser `track.id` can differ from SFU `trackName` without misattribution (`frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts:109`, `frontend/src/app/services/remote-audio.service.spec.ts:381`).

Core path re-check: service-owned registry still does sink/volume/mute before `play()`, has no autoplay attribute, diffs by stream/track identity, removes departed publishers, and uses registry `remoteAudioBlocked` for banner/recovery (`frontend/src/app/services/remote-audio.service.ts:403`, `frontend/src/app/services/remote-audio.service.ts:440`, `frontend/src/app/services/remote-audio.service.ts:452`, `frontend/src/app/services/remote-audio.service.ts:540`, `frontend/src/app/pages/room/room.page.ts:628`).

Verification run:

`npx tsx frontend/src/app/services/remote-audio-watchdog.spec.ts && npx tsx frontend/src/app/services/remote-audio.service.spec.ts && npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts && npx tsx frontend/src/app/services/sfu-client.spec.ts` — PASS.

Note: the packet says `../consensus-r4-registry.md`; that relative path from `code-redteam-packet-CR3.md` does not exist, but the actual file is present at `plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-08/deliberation/T1-host-inaudible-remote-audio/consensus-r4-registry.md` and was reviewed.

## NEW bugs

none

STATUS: CLEAN — no real bug in current code
