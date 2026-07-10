# P3-LIVE-06 PROPOSED plan

## Instrumentation: inbound RTP stats deltas on page1, sampled around the existing dwell

Reuses the exact pattern `call-driver.ts`'s own `sampleOutboundAudioBytes()` already uses
(`await window.__meetDebug.sfuGetStats()`, then `stats.forEach(stat => ...)` over the
`RTCStatsReport` — confirmed this is genuinely awaited/Map-iterated in the existing, working
harness code, not the bare non-awaited call `receive-side-recorder.ts` uses elsewhere) — just
filtering `type === 'inbound-rtp'` + `(kind ?? mediaType) === 'audio'` instead of `outbound-rtp`,
and reading `packetsReceived`/`bytesReceived` instead of `bytesSent`.

**New**: `sampleInboundAudioStats(page)` in `dom-audio-capture.ts` (co-located with the other
page-stats helpers; no changes to `call-driver.ts`/`receive-side-recorder.ts` — those stay exactly
as they are, per the brief's "DO NOT re-litigate" instruction).

**Wiring**: in `p3-live-06-smoke.ts` (copy of `p3-live-05-smoke.ts`), inside `onLive`:
1. Sample inbound stats on `page1` at **t0** (immediately after `startDomRemoteAudioCapture`
   installs, before the dwell sleep).
2. Dwell 6s (unchanged).
3. Sample inbound stats on `page1` at **t1** (immediately before `stopDomRemoteAudioCapture`).
4. Compute `Δpackets = t1.packetsReceived - t0.packetsReceived`, `Δbytes = t1.bytesReceived -
   t0.bytesReceived`. Write both raw samples + deltas to
   `validation/p3-live-06-evidence/inbound-stats.json` regardless of outcome (evidence either way,
   not just on failure).
5. Also sample page2's (bot-123, the CDP-remote leg) **outbound** stats at t0/t1 for
   cross-reference, reusing the existing `sampleOutboundAudioBytes` shape — confirms the sender
   side keeps advancing during the same window we're checking the receiver.

## Branch on the result (brief items 3-4)

- **If Δpackets/Δbytes > 0** (inbound genuinely advances) but the DOM capture is still silent →
  the problem is downstream of SFU delivery, in local playout/rendering specifically — re-open
  with this new evidence (would point back toward the playout graph, gain/compressor, or
  `voice-stalled` watchdog's own threshold being wrong even though real audio arrives). No
  topology change attempted in that branch this batch — report with the delta evidence for the
  next batch's PROPOSED.
- **If Δpackets/Δbytes == 0** (inbound never advances) → the SFU genuinely isn't forwarding
  bot-123's real-mic audio to bot-140 on this split-host path. Candidate mechanism-level fixes to
  try live (harness-only, no product code without a fresh PROPOSED+APPROVED):
  - Check ICE connection state / selected candidate pair on page1's PC via `sfuGetStats()`
    (`type==='candidate-pair', state==='succeeded'`) — confirms the receive leg's transport is
    actually up.
  - Check whether page1 ever issues an explicit "subscribe" to bot-123's track (if the app's SFU
    protocol requires an explicit subscribe step per remote publisher, versus auto-forwarding) —
    grep `sfu-client.service.ts` for subscribe/track-added handling before assuming a bug.
  - Sanity-check the `--host-resolver-rules` / `meet140.localhost` alias isn't causing bot-123's
    published track to be scoped to a different apparent room/session identity than what bot-140
    subscribes to (split-host specific: two different physical hosts, one alias).
  Will report findings + do the smallest verified fix; if the true cause turns out to need
  backend/SFU code, stop and report BLOCKED with evidence rather than improvising product changes
  without approval (per this brief's explicit gate).

## Acceptance

Same bar as prior batches: `acceptanceAttempt:false`, both `publishedBytes>0`, DOM WAV `rms>0`.
Evidence (stats JSON + WAV if produced) → `validation/p3-live-06-evidence/`. `free -h` checked
before launch (2Gi floor). Room cleanup inline via `canDelete()`, same as P3-LIVE-05 (no leak
there — this smoke's structure doesn't throw before the cleanup step in the success path; if a
throw path reappears I'll clean up manually and note it, as done before).

## Explicitly not doing

- Not reinstalling/touching PulseAudio (confirmed correct in P3-LIVE-05, left as-is).
- Not re-opening the ctor-hook (`receive-side-recorder.ts`)/zone.js investigation.
- Not moving the receiving browser to `.123` (still a bigger topology change, not this batch's
  default path) unless the stats prove it's specifically an ICE/candidate-pair problem tied to
  split-host, in which case I'll stop and propose that explicitly rather than just doing it.

Awaiting APPROVED-PLAN before running live against .123.
