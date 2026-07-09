  3. Risks
  - Low. Purely additive reader, no behavior change to any existing path
  (collectDiagnostics, hasOutboundAudioTrack, getOutboundAudioSource untouched).
  - Only real risk is drifting into scope creep (classifier/wiring) — brief
  explicitly forbids it; I'll stop at the reader.
  - Naming: plan.md and brief both say getOutboundLiveness() — using that exact
  name for the service method; pure extractor gets the extractOutboundLiveness /
  OutboundLivenessStats names to match the existing extractOutboundAudioSource
  / OutboundAudioSourceStat convention.

  4. Estimate: ~20 minutes (well inside the 25 budgeted / 30 hard cap).

  5. Tier confirm: L3 (sonnet), per §4b — matches.

  6. Self-hygiene: No rooms/sessions/harness state touched — this is a pure
  unit-level, product-code-only change (mic-energy.ts + sfu-client.service.ts +
  a .spec.ts). Nothing to clean up.

  STATUS: PROPOSED — awaiting APPROVED-PLAN. Logged to callbacks.md.

✻ Cogitated for 1m 54s

❯ REVISE-SCOPE before you finish PROPOSED (D29 from /north just landed):

  1) Still: getOutboundLiveness() ONE getStats() pass → totalAudioEnergy +
  totalSamplesDuration (media-source capture) AND packetsSent + bytesSent
  (outbound-rtp audio).

  2) NEW D29 binding: also emit those FOUR fields in the APP diagnostics
  payload per outbound audio track (collectDiagnostics / track telemetry). Real
  calls must be diagnosable — not harness-only.

  3) Do NOT touch classifyMicCapture/R1 remedies. Reader+emit only. R1 is BLIND
  to sender-dead; that is B13W later.

  4) Re-read updated brief: plan/.../prompts/b08a1-impl-brief.md

  Then emit PROPOSED (include diagnostics emit files) and STOP for
  APPROVED-PLAN. Append callback to callbacks.md.

  Searched for 2 patterns, read 2 files (ctrl+o to expand)

● Bash(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
  ⎿  2026-07-09T03:49:16+00:00

  Read 1 file (ctrl+o to expand)

● PROPOSED (rev 2 — D29 scope) — B08A-1

  1. Mechanism diagnosis
  Two independent surfaces, same underlying extractor, still exactly one
  getStats() per surface:

  - Harness reader — getOutboundAudioSource() (sfu-client.service.ts:806-816) is
  the precedent: one pc.getStats(), delegate to a pure mic-energy.ts extractor.
  getOutboundLiveness() follows the same shape.
  - App diagnostics (D29, new) — collectDiagnostics() (:1152-1330) already does
  ONE pc.getStats() and already loops outbound-rtp entries into
  SfuOutboundTrackStats[] (:1220-1240), reading bytesSent/packetsSent per track
  today (:1227-1228). Capture-side (totalAudioEnergy, totalSamplesDuration) is
  currently only exposed flat at the snapshot's top level via
  outboundAudioSource (:1183, :352 — {audioLevel, totalAudioEnergy} only, no
  totalSamplesDuration). D29 requires these per outbound audio track, not just
  flat — so I merge the capture-side pair onto each kind==='audio' entry inside
  the existing outbound-rtp loop, reusing the stats object collectDiagnostics
  already fetched (no new getStats() call — the D28/D29 "one bundled
  RTCPeerConnection" doctrine means there's normally exactly one audio
  outbound-rtp entry to merge onto).

  2. Files + why

  - frontend/src/app/services/mic-energy.ts — new pure
  extractOutboundLiveness(stats) → { totalAudioEnergy, totalSamplesDuration,
  packetsSent, bytesSent } (all number|null, non-number → null, never throws).
  One loop over stats.values(): media-source/audio → capture pair,
  outbound-rtp/audio → sender pair. Mirrors extractOutboundAudioSource's idiom
  exactly.
  - frontend/src/app/services/sfu-client.service.ts —
    - async getOutboundLiveness(): Promise<OutboundLivenessStats | null>
  pc.getStats(), delegates to the extractor, null on no-pc/throw.
    - collectDiagnostics(): call extractOutboundLiveness(stats) once over the
  already-fetched report; in the existing outbound-rtp loop, when stat.kind ===
  'audio', set track.totalAudioEnergy / track.totalSamplesDuration from that
  single capture-side read (existing bytesSent/packetsSent per-entry logic is
  untouched — it's already correctly per-track).
  - frontend/src/app/services/meeting-sessions.service.ts — extend
  SfuOutboundTrackStats (:265-277) with totalAudioEnergy?: number | null;
  totalSamplesDuration?: number | null; (optional, additive — no consumer
  breaks).
  - frontend/src/app/services/mic-capture-health.spec.ts — append unit section
  for extractOutboundLiveness: all-four-present, non-number → null per field,
  missing stat types → null, never throws on garbage.
  - frontend/src/app/services/sfu-client.spec.ts — extend the existing
  collectDiagnosticsFromStats helper's fixture with a media-source/audio stat,
  assert the resulting audio outboundTracks[] entry carries the four fields, and
  re-assert getStatsCalls === 1 (same counting-pc-double pattern already in
  this file at :299-329/:1163).

  3. Risks
  - Low — additive only. classifyMicCapture, R1, banners, and all existing
  diagnostics fields are untouched (per your D29 R1 note — reader+emit only).
  - SfuOutboundTrackStats gaining two optional fields is backward-compatible for
  any downstream consumer (dashboards/logs reading this snapshot) since they're
  optional and only populated for kind==='audio'.
  - Slightly larger diff than rev 1 (now touches diagnostics emit path + type
  file), still tight and single-purpose.

  4. Estimate: ~25 minutes (within the 30 min hard cap; brief budgets 25).

  5. Tier confirm: L3 (sonnet), unchanged.

  6. Self-hygiene: No rooms/sessions/harness state touched — pure product-code +
  type + spec changes across 5 files. Nothing to clean up. 652c1475/TEST_ROOM01
  untouched.

  STATUS: PROPOSED — awaiting APPROVED-PLAN. Logged to callbacks.md.

✻ Cogitated for 1m 10s

────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ bypass permissions on (shift+tab to cycle) · ← for agents

