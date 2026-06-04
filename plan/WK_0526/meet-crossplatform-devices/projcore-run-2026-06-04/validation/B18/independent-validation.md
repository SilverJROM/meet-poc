# B18 — Independent Validation (3-agent): recording REC1/REC2/REC3

**Verdict: SOLID** (projcore + independent 2nd validator agree). Committed by projcore (3-agent). Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx` specs pass: recorder-leaks, room-recording, active-speaker-leaks. ✅
- `npx ng build` green. ✅
- DEV: pm2 meet-poc-fe restarted (online).
- Caller audit: only `RecorderService.start()` caller is room.page.ts:1248 and it `await`s; the recorder.service :127/:130 `start()` are the internal MediaRecorder.start (unaffected by the async change).

## projcore diff review (scope clean — no SFU/signaling/ice-config/B17/active-speaker-detection touched)
- **REC1** recorder.service.ts `start()` now async; `if (ctx.state==='suspended') { try { await ctx.resume() } catch { warn+continue } }` BEFORE pickMime/new MediaRecorder/recorder.start. `toggleRecording` awaits, so `recording-state: 'started'` is announced only after the mixer runs. `recordedClientIds()` returns `[...sourceFor.keys()]`. ✅
- **REC2** new room-recording.ts `syncRecorderPeerStreams(peers, recorder)`: adds non-local peers, then evicts `recordedClientIds()` not in live activePeerIds, guarding `clientId !== 'local'` (double-guard: local skipped when building activePeerIds AND explicit 'local' check). Replaces the dead peers-vs-peers loop. ✅
- **REC3** new room-recording.ts `recordPeerResumed(recorder, oldId, participant)`: `notifyParticipantLeft(oldId)` (stamps leftAtMs + removePeerStream) then `notifyParticipantJoined(new)`. room.page peer-resumed calls it before `removePeer`; the old standalone notifyParticipantJoined was removed (no double-notify). ✅

## Independent 2nd validator (sonnet, adversarial) — SOLID
- REC1: resume genuinely awaited before MediaRecorder construction; try/catch continues degraded; only one awaited caller; started announced after resolve.
- REC2: eviction is recorder-tracked vs live-peers; 'local' double-guarded; removePeerStream idempotent; a momentarily-absent peer is NOT spuriously evicted because peer-reconnecting keeps it in peerIdentities → stays in peers().
- REC3: leave-before-removePeer ordering correct; new id captured reactively (remoteStreams→peers→sync effect→addPeerStream); no double notifyParticipantJoined; participants.has() dedup guard intact.
- No regression on start/stop/upload, LEAK2 dedupe, active-speaker, peer-left.

## Honesty
Real mobile (iOS/Android) audible-recording + live drop/reconnect-during-recording is JROM's device seat — unit/build proves the mechanism, not the device. Not claimed device-proven by e2e.
