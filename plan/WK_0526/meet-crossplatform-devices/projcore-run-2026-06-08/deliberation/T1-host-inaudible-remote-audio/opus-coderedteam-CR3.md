# opus CODE red-team CR3
(Note: my CR2 verdict missed the stuck-latch — being exhaustive on the clear paths this round.)

## CR-fix-2 verify
- **Latch NON-STICKY: CONFIRMED.** `clearVoiceStalls([peerId])` is hit on EVERY non-stall watchdog path: no-sample (room.page.ts:2741), bytes-flat (2760), window-has-no-voice-energy (2773), mutedAll (2709 all / 2723 per-peer). Emitted-advance → noteVoiceEmissionAdvanced. The ONLY set path is recoverVoicePlayout AFTER the verdict passes bytes-up + emitted-flat + sampleWindowHasVoiceEnergy. So voiceStalled persists ONLY while a fresh genuine-stall verdict keeps recurring; any other outcome clears it next poll. Stuck-forever is now impossible. 
- **Energy-gate: CORRECT** — `sampleWindowHasVoiceEnergy(state.samples)` evaluates over the sample WINDOW (not a single point), so CN/keepalive silence (bytes climb, energy ~0) clears instead of latching. Closes the CR2 false-positive.
- **Touched-only rollback: CORRECT.** `restorePublisherStream(this.remoteStreams, publisher.clientId, before)` restores ONLY the failing publisher's entry (sfu-client.service.ts:1788-1790); midToEntry/subscribedTracks rolled back per-touched-mid only (1767-1786). A DIFFERENT publisher's concurrent post-snapshot ontrack stream (different clientId) is untouched. Closes CR2 BUG2.
- **trackName join: CORRECT** — subscribed SFU trackName carried through (restorePublisherTrackNames / publisherTrackNames map); diagnostics joins inbound energy by publisher+trackName.

## NEW bugs found
None. Core path re-checked: addPublisher sink-before-play + guards (363-428) unchanged & correct; syncPeers diff/track-replace/dedup (240-260) intact; banner registry+voiceStalled-backed; mid-guard reclaim-safe; reset clears unlocked/sink. tsc=0, specs pass, ng build green.

## Residual judgment (honest)
The voiceStalled watchdog feature added complexity that generated 2 rounds of edge-bugs; CR-fix-2 has now made it robust (non-sticky + energy-gated). I cannot prove the absence of ALL edges, but the specific CR1/CR2 findings are closed and the clear-on-every-path invariant is structurally sound. If CR3+ surface more latch edges, consider simplifying to "advisory banner that always clears within N polls unless re-asserted" — but as-is it meets the bar.

STATUS: CLEAN — CR-fix-2's fixes are correct (non-sticky energy-gated latch; touched-only rollback preserving concurrent publishers; trackName energy join); no new bug found. Vote toward clean streak 1/3.
