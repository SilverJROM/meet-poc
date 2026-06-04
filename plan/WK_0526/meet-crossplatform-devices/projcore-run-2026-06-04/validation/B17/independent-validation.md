# B17 — Independent Validation (3-agent): resource leaks LEAK2/3/4/5

**Verdict: SOLID** (projcore + independent 2nd validator agree). Committed by projcore (3-agent: codex left uncommitted). Verifier ≠ fixer.

## Proof re-run by projcore
- `npx tsx` specs all pass: recorder-leaks, active-speaker-leaks, sfu-client (roster utils), media-acquisition, remote-audio.service, media-toggle, local-media-recovery. ✅
- `npx ng build` green (pre-existing warnings only: NG8113 DatePipe-unused-in-RoomsPage, stencil glob, mediapipe ESM). ✅
- DEV: pm2 meet-poc-fe restarted (online).

## projcore diff review (scope clean — no B08 decision / B11 state machine / B15 / B16 touched)
- **LEAK2** recorder.service.ts `addStream`: `if (sourceFor.has(clientId)) removePeerStream(clientId)` before creating the new source → prior `MediaStreamAudioSourceNode` disconnected+deleted, sourceCount accurate. 0-audio-track-on-readd path still removes the stale source (no orphan). ✅
- **LEAK3** active-speaker.service.ts: `if (analyzers.has(peer.id)) this.remove(peer.id)` before building the analyser graph → one analyser/source/sink per peer; `remove()` disconnects all 3 nodes. Detection thresholds/RMS/`measure()` untouched. ✅
- **LEAK4** sfu-client.service.ts: both raw `setTimeout(()=>subscribeRetryVersion.update...)` sites → `scheduleSubscribeRetryBackoff()` (adds to `subscribeBackoffTimers`, self-deletes on fire); `clearAllSubscribeBackoffTimers()` called in all 3 teardown paths beside `clearAllSubscribeStuckWatchdogs()`. `nextSubscribeRetry`/`planSubscribeRetry`/transport-recovery untouched. ✅
- **LEAK5** media.service.ts `registerDebugTracks`: deterministic `pruneDebugTracks()` (drop `readyState==='ended'` + dedupe by reference + cap 64) at top + `('ended', pruneDebugTracks, {once})` listener per track. No WeakRef. ✅

## Independent 2nd validator (sonnet, adversarial) — SOLID
- LEAK2: removePeerStream disconnects prior node before new source (lines 219/222-225); sourceCount accurate; 0-track re-add → 1→0 sources, no orphan, acceptable.
- LEAK3: belt-and-suspenders (observe() removes-then-adds on stream change + add() independently guards); remove() disconnects source/analyser/sink, stops processor; thresholdRms=0.01 + RMS math + measure() entirely untouched.
- LEAK4: grep confirms only the 2 helper call sites remain (no untracked update setTimeout); self-delete-on-fire prevents set growth; clearAll present in clearLocalTransportSessionState/closeLiveTracksForExit/destroy; planSfuTransportRecovery/reset/start untouched. Spec manually fires post-teardown timers and proves subscribeRetryVersion doesn't advance.
- LEAK5: prune-before-append + {once} ended listener + indexOf dedupe + slice(-64) cap; an ended track cannot stay pinned.

## Honesty
Unit/build proof covers the intended leak mechanisms. Real long-session heap/CPU endurance profiling (hours, 3-5 parties, repeated reconnect) is JROM's seat — not claimed proven by automated tests.
