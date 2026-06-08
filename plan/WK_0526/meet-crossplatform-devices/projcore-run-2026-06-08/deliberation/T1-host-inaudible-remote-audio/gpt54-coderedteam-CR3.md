# gpt54 CODE red-team CR3
## CR-fix-2 verify: latch-nonsticky / rollback-touched-only / energy-join — OK or gap

OK.

- `voiceStalled` is no longer sticky in the current code. It is explicitly cleared on:
  - `mutedAll` in [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:222)
  - no active sample / no inbound audio stat in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2740)
  - peer removed from active inbound set in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2721)
  - emitted-count advance in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2754)
  - bytes-flat window in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2759)
  - no-energy window in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:2772)
- The energy gate is windowed, not single-point: `sampleWindowHasVoiceEnergy()` checks max audioLevel across the sample window and falls back to totalAudioEnergy delta across at least two finite samples in [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:91).
- Touched-only subscribe rollback looks correct. The failing subscribe restores only touched mids plus the failing publisher’s pre-snapshot stream/screen/trackName state, while preserving unrelated concurrent publisher state in [frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1766). The adjacent regression coverage for concurrent stream/trackName preservation is present in [frontend/src/app/services/sfu-client.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.spec.ts:1399).
- Diagnostics now join per-publisher playout rows to inbound audio stats by `publisherClientId + trackName`, with publisher-only fallback only when no playout `trackName` exists, in [frontend/src/app/pages/diagnostics/diagnostics.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.ts:105). Current specs cover that mapping in [frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts:118).
- Core path remains intact after CR-fix-2: service-owned add-before-play registry flow in [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:403), syncPeers diff/track-replace in [frontend/src/app/services/remote-audio.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/remote-audio.service.ts:239), room banner/recovery wiring in [frontend/src/app/pages/room/room.page.ts](/home/agjrom/websites/meet-poc/frontend/src/app/pages/room/room.page.ts:631), and subscribe mid reconcile/rollback in [frontend/src/app/services/sfu-client.service.ts](/home/agjrom/websites/meet-poc/frontend/src/app/services/sfu-client.service.ts:1648).
- Executed targeted regression specs against the current tree:
  - `npx tsx frontend/src/app/services/remote-audio.service.spec.ts`
  - `npx tsx frontend/src/app/services/sfu-client.spec.ts`
  - `npx tsx frontend/src/app/pages/diagnostics/diagnostics.page.spec.ts`
  - All passed.

## NEW bugs

none

STATUS: CLEAN — no real bug in current code
