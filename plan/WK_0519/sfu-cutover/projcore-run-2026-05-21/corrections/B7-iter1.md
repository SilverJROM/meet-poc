# Correction — B7 iter1 (VALIDATED-FAIL by codex)

Codex confirmed the reconnect MECHANICS are right (reset ordering, removePeer(oldClientId) ghost teardown, drop-vs-exit distinction, mesh unchanged) but FAILED on 2 things. Fix BOTH.

## Gap 1 (CODE, clear): deliberate exit doesn't close the SFU PeerConnection
- `closeLiveTracksForExit()` closes live CF tracks (fire-and-forget PUT close) but does NOT close the SFU `RTCPeerConnection`. The PC only closes later via `destroy()`/ngOnDestroy after navigation. SR-7 + the brief require exit to close tracks AND the PC.
- FIX: on deliberate exit, close the SFU PC too (e.g. closeLiveTracksForExit also calls pc.close() + clears senders, or cleanupCall explicitly tears down the SFU PC). Ensure no double-close crash if destroy() later runs.

## Gap 2 (RELIABILITY + TEST): subscribe sometimes never completes (A.subscribedTracks stuck at 0)
- The B7-drop e2e failed on BOTH codex runs: A's subscribedTracks stayed at 0 (expected 2) — once AFTER reconnect, once even during INITIAL setup (before any drop, after 90s). B4a also transiently failed (packetsReceived=0). So subscribe is sometimes not completing.
- LIKELY ROOT CAUSE to investigate: A only subscribes to B when A's OWN `localPublishState.status === 'published'` (the B4a race guard). If A's publish round-trip to CF is slow/delayed, the subscription effect's guard stays false and A never subscribes — even though B is in the roster. Also check: does the subscription effect RE-FIRE if it was skipped because publish wasn't ready yet? If the effect only runs on remotePublishers change (not on publish-status change), a roster that arrived BEFORE publish completed is never retried.
- FIX (do the minimal correct one):
  1. Ensure the subscription effect re-evaluates the FULL roster when `localPublishState.status` becomes 'published' (not only on roster change) — so peers known before our publish finished get subscribed once we're ready. Add a defensive re-subscribe pass.
  2. If a subscribe genuinely didn't complete (no tracks after the round-trip), it should be retried (bounded) rather than silently leaving subscribedTracks=0.
  3. Make the e2e robust: generous polled waits for subscribe completion (the real-CF subscribe can take many seconds in headless), and ensure setupTwoClients waits for BOTH publish AND subscribe to settle before asserting/continuing.
- If after this the residual failures are purely headless/real-CF LATENCY (subscribe eventually completes, just slowly) and NOT a logic gap, make the test deterministic (assert the subscribe REQUEST fired + roster reconciled correctly + a new cfSessionId on reconnect, with a long media-settle timeout) and note the latency explicitly — full real-media timing is validated at B10/field. But first make a genuine effort on the re-subscribe-on-publish-ready fix above, since "A never subscribes if its own publish is slow" is a REAL product bug, not just test flakiness.

## Preserve (do NOT redo)
- resetForReconnect ordering, removePeer(oldClientId) on peer-resumed, drop-vs-exit distinction, re-publish path — all confirmed correct by codex. Leave them.

## After fixing
Re-run tests/sfu-b7-reconnect + tests/sfu-b4a-subscribe (the EXACT command codex used, twice, to confirm it's not flaky). Callback FIRST, commit before STATUS: DONE. If you conclude the residual is pure environmental latency after fixing the re-subscribe gap, say so explicitly with evidence in changes.md.
