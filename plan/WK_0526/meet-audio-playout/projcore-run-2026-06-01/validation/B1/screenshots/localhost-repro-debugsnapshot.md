# B1 localhost repro — debugSnapshot before/after (NS5 rendered-audio proxy)

Captured from the B1 e2e harness (`__suspendForTest` / `__injectRemoteSourceForTest`
localhost-only hooks) against the isolated dev webserver (`http://localhost:4740`),
mirroring the real suspended-AudioContext-with-sources failure mode.

## E3 recovery path (the BUG-1 + BUG-2 fix, observed)

PRE-CLICK  (context suspended, source present — the host-can't-hear state):
```
{"mixerEnabled":true,"contextState":"suspended","outputAttached":true,
 "outputPaused":false,"mutedAll":false,"volume":1,
 "mixedPeerIds":["e3-src"],"mixedTrackIds":["0be2e560-...-0a0386404256"]}
```
→ `.audio-unblock-notice` "Tap to enable audio" banner VISIBLE
   (pre-fix this banner never surfaced because playability was computed from
   `element.paused` only — a suspended context returned allPlayable=true).

POST-CLICK (genuine "Enable audio" gesture → resume + mixer play() re-attempted):
```
{"mixerEnabled":true,"contextState":"running","outputAttached":true,
 "outputPaused":false,"mutedAll":false,"volume":1,
 "mixedPeerIds":["e3-src"],"mixedTrackIds":["0be2e560-...-0a0386404256"]}
```
→ banner count 0 (cleared). contextState `suspended → running`,
  outputPaused `false`, outputPlaying `true`.

## Why this is the rendered-audio proxy (NS5)

A `MediaStreamAudioSourceNode` only pulls samples (→ `jitterBufferEmittedCount`
climbs / audio reaches the speaker) when `AudioContext.state === 'running'`. The
`suspended → running` transition with sources attached + output playing is the exact
observable that the jitter buffer can now emit. Headless fake-media cannot emit a
real climbing `jitterBufferEmittedCount` (synthetic silent track, no peer connection),
so per NS5 the `contextState`/`outputPlaying` snapshot transition is the deterministic
proxy; live two-machine speaker confirmation remains JROM's seat.

## E6 SOFT (honesty clause, NS5)

```
[E6 SOFT] no live inbound-audio RTP under this harness (first=null, second=null);
expected limitation — injected synthetic source has no peer connection.
Falling back to snapshot proxy (running + unpaused).
Real emitted-count climb is JROM's two-machine seat (NS5).
```
E6 is SOFT and did not gate; it passed via the snapshot proxy fallback as designed.
