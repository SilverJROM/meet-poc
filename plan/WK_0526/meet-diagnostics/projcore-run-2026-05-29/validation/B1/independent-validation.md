# Independent Validation — B1 / R1 (Local mic-energy metric)

**Validator:** fresh-context independent (did NOT read plan / scenarios / code-review)
**Branch:** `feat/meet-diagnostics-audio-20260529` @ HEAD `3c1ebff` (confirmed matches brief)
**Date:** 2026-05-30

## REQUIREMENT (contract)
R1 — every diagnostic `sample` must carry real, non-null `outboundAudioLevel`,
`outboundAudioEnergy`, `micSilent` on ALL clients (host + guests), sourced from
the local audio track. Plus constraints: micSilent from INSTANTANEOUS audioLevel
(not cumulative totalAudioEnergy); raw numeric level stored; micSilent true when
muted OR enabled-but-energy~0; graceful null absence; not gated on owner/login.

## What I checked (code, not docs)

### (a) Fields no longer hardcoded null; wired to a real source-side signal — PASS
- `sfu-client.service.ts` `collectDiagnostics()` reads the `media-source` /
  `kind==='audio'` stat (RTCAudioSourceStats) and extracts `audioLevel` /
  `totalAudioEnergy` (lines 340-349), carried on the snapshot as
  `outboundAudioSource` (line 440). This is the source-side instantaneous mic
  signal — exactly the RTCAudioSourceStats fields named in the brief.
- `room.page.ts` `buildDiagnosticsPayload()` (lines 2429-2452) replaces the
  former hardcoded `null, null, null` with `micFields.outboundAudioLevel /
  outboundAudioEnergy / micSilent` from `deriveOutboundAudioFields(...)`. No
  literal nulls remain at the payload site.

### (b) Derivation matches the constraints — PASS
`mic-energy.ts` `deriveOutboundAudioFields`:
- `micSilent` derives from INSTANTANEOUS `audioSource.audioLevel <
  MIC_SILENCE_LEVEL_THRESHOLD (0.01)` (lines 58-61). `totalAudioEnergy` is only
  passed through to `outboundAudioEnergy` — it is NEVER consulted for the
  silence decision. Verified by SC-5 test (level 0.5 + energy 0 -> not silent;
  level 0.005 + energy 9999 -> silent). Cumulative energy provably irrelevant.
- Raw numeric `audioLevel` stored in `outboundAudioLevel` (line 64), not a
  boolean.
- micSilent true when muted (`!micEnabled` -> `micSilent:true`, line 41-46, even
  with raw level passed through) OR enabled-but-near-zero (level < 0.01, line 58).
- Partial stats (source present, `audioLevel` null) -> `micSilent:null` (no false
  claim) — line 58-61, covered by the partial-stats test block.

### (c) Genuinely client-side for ALL clients (no owner/host/login gating) — PASS
- Ground truth read from `this.media.localStream()?.getAudioTracks()[0]`
  (`room.page.ts:2430`). `localStream` is a signal holding the local capture
  `MediaStream` (`media.service.ts:44`) — local, not remote.
- The diagnostics flush (`flushDiagnosticsLog`, `startDiagnosticsLog`) is gated
  ONLY on `diagnosticsLoggingEnabled()` (a settings toggle) and
  `currentSessionId()` — NOT on `isHost()` / `isOwner()` / login. Verified by
  grep: the `isHost`/`isOwner` checks in room.page.ts are all for unrelated
  features (screen-share, host controls, password); none guard the diagnostics
  payload or the mic-energy derivation.
- The media-source stat in `collectDiagnostics` is read from the local
  RTCPeerConnection's own getStats — same for any client that publishes audio.

### (d) Graceful absence handled (no crash, no regression) — PASS
- `collectDiagnostics` sets `outboundAudioSource: null` in BOTH early returns
  (no-pc/no-publishState line 301; getStats-catch line 322) and uses
  `typeof === 'number'` guards on the extracted fields (lines 344-345), so a
  partial report yields null, never a throw.
- `mic-energy.ts` TT-E (no live track, line 35) and TT-D (live+enabled but no
  source, line 51) both return all-null without dereferencing a missing source.
  SC-4 asserts `doesNotThrow` on a null source.
- Diagnostics view (`diagnostics.page.ts:185-197`) null-guards before
  `.toFixed()` ("level n/a" / "energy n/a") and treats `micSilent` as tri-state
  ("MIC SILENT" / "mic live" / "n/a"). No crash on null.

### (e) Values reach a stored sample and render — PASS
- Path traced: `buildDiagnosticsPayload` -> payload `{outboundAudioLevel,
  outboundAudioEnergy, micSilent}` (room.page.ts:2450-2452) ->
  `appendDiagnostics(sessionId, payload)` (room.page.ts:2421) -> HTTP POST of the
  full payload (meeting-sessions.service.ts:405-407). Fields are top-level on
  `DiagnosticsPayload` (type lines 345-347) so they serialize.
- View: `micLivenessSummary` / `micLivenessClass` are bound in
  `diagnostics.page.html:86` and `:106` (latest + per-entry), so the fields are
  surfaced, not dead methods.

### Single getStats() — PASS
Exactly ONE `pc.getStats()` call inside `collectDiagnostics` (line 309); the
media-source capture reuses the same `stats` report in its own loop. The
dedicated loop (lines 340-349) runs BEFORE the candidate-pair loop and is not
subject to the candidate-pair `break` — the iteration-order hazard the brief
warns about is correctly avoided.

## Unit test
```
$ cd frontend && npx tsx src/app/services/mic-energy.spec.ts
mic-energy: all assertions passed
EXIT=0
```
Covers TT-A/B/C/D/E, SC-5 (instantaneous-not-cumulative, both directions),
partial-stats, and the 0.01 threshold constant. All assertions pass.

## Skeptical checks (looked for, did NOT find)
- Fields still null on some path: NO — both early returns set
  `outboundAudioSource:null` and the derivation handles null gracefully; payload
  site has no literal nulls.
- micSilent secretly using cumulative energy: NO — provably uses `audioLevel`
  only (SC-5 confirms energy ignored).
- Path drops value before upload: NO — full payload POSTed verbatim.
- Owner/login gating: NO — gated only on a settings toggle + session id.
- Crash when stats absent: NO — guards + null returns; view null-safe.

## VERDICT

STATUS: PASS — R1 satisfied. The three fields are wired to the real source-side
RTCAudioSourceStats (audioLevel/totalAudioEnergy) read in the single existing
getStats pass, derived per the truth table (instantaneous-driven micSilent, raw
level stored, muted->true, graceful null absence), computed client-side from the
local audio track with no host/owner/login gating, and the values reach a stored
sample and render in the diagnostics view. Unit test passes (EXIT=0).

Note (headless limitation, not a defect): a live non-null value cannot be
observed end-to-end here because a real mic can't be captured headless — this is
inherent to the environment, not a gap in the change. Static + unit-test
evidence fully supports the wiring.
