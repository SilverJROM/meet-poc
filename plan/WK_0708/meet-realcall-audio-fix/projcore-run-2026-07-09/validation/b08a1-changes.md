# B08A-1 Changes — AC15a sender-liveness stats reader (D28 + D29)

**Commit:** pending (recorded below after commit)
**Date:** 2026-07-09
**Test Status:** pure-extractor unit tests + `sfu-client.spec.ts` integration tests, all passing; FE build green

## Verdict: READER + EMIT ONLY. No classifier, no R1/remedy touch, closes no AC.

### Scope (D28 + D29, as APPROVED-PLAN'd)

1. `getOutboundLiveness()` — ONE `getStats()` pass returning capture-side (`media-source`/audio:
   `totalAudioEnergy` + `totalSamplesDuration`) and sender-side (`outbound-rtp`/audio: `packetsSent` +
   `bytesSent`).
2. **D29 (new):** the same four fields, emitted **per outbound audio track** in the app's own
   `collectDiagnostics()` payload — so a real call, not just the harness, can discriminate
   capture-dead vs sender-dead. 07-08 only had `outboundAudioLevel` + `micSilent`.
3. `classifyMicCapture` / R1 / any remedy path: **untouched**. Confirmed no lines changed outside the
   five files below.

### Files Modified

1. **`frontend/src/app/services/mic-energy.ts`**
   - New pure `extractOutboundLiveness(stats)` → `OutboundLivenessStats { totalAudioEnergy,
     totalSamplesDuration, packetsSent, bytesSent }` (all `number | null`). ONE loop over
     `stats.values()`: first `media-source`/`kind==='audio'` entry → capture pair; first
     `outbound-rtp`/`kind==='audio'` entry → sender pair. Non-number → null per field, missing stat
     type → null fields, never throws (mirrors `extractOutboundAudioSource`'s exact idiom, same file).

2. **`frontend/src/app/services/sfu-client.service.ts`**
   - New `async getOutboundLiveness(): Promise<OutboundLivenessStats | null>` next to
     `getOutboundAudioSource()` — one `pc.getStats()` call, delegates to the new extractor, `null` on
     no-pc/throw. Standalone harness/app reader.
   - `collectDiagnostics()`: added one `extractOutboundLiveness(stats)` call over the **already-fetched**
     stats report (no second `getStats()`), then merged `totalAudioEnergy` / `totalSamplesDuration`
     onto each `outbound-rtp` entry where `stat.kind === 'audio'` inside the existing per-track loop.
     Existing `bytesSent`/`packetsSent` per-track extraction (already correct, already per-track) is
     untouched.

3. **`frontend/src/app/services/meeting-sessions.service.ts`**
   - `SfuOutboundTrackStats` gains two optional fields: `totalAudioEnergy?: number | null;
     totalSamplesDuration?: number | null;`. Additive, backward-compatible — only populated for
     `kind==='audio'` entries.

4. **`frontend/src/app/services/mic-capture-health.spec.ts`**
   - New section (U-33..U-35) for `extractOutboundLiveness`: all-four-present extraction, non-number →
     null per field (string/undefined inputs — NOT `NaN`, since `typeof NaN==='number'` and the sibling
     `extractOutboundAudioSource` in this same file does not special-case it either; kept consistent
     with the established convention rather than introducing a one-off `Number.isFinite` check), missing
     stat types → all-null, never throws on a malformed/partial entry.

5. **`frontend/src/app/services/sfu-client.spec.ts`**
   - Extended the existing `collectDiagnosticsFromStats` fixture with a `media-source`/audio stat;
     asserted the resulting `outboundTracks` audio entry carries `totalAudioEnergy`/`totalSamplesDuration`
     merged, the video entry does NOT (`undefined`, never merged), the existing `getStatsCalls === 1`
     assertion still holds (no second `getStats()`), and the "missing" fixture path yields `null` (not
     `undefined`) on the audio track when no `media-source` stat is present.
   - New standalone block: `getOutboundLiveness()` proven with a call-counting `pc` double —
     `getStatsCalls === 1`, correct four-field extraction, and `null` (never throws) when there is no
     peer-connection.

### Test Results

```
$ cd frontend && npx tsx src/app/services/sfu-client.spec.ts
... (pre-existing recovery/subscribe console.error noise from other suites in the same file)
sfu-client roster utils: all assertions passed
```

`mic-capture-health.spec.ts` as a whole file has a **pre-existing, unrelated** failure at line
120 (`classifyMicCapture` "flat energy + high level -> not silent"), confirmed present at HEAD
`08a369c` via `git stash` before any of this batch's edits — not touched or caused by B08A-1. The new
U-33..U-35 assertions were verified in isolation (extracted to a throwaway scratch script importing
the real `mic-energy.ts`, all three passed) since the pre-existing failure aborts the file before
reaching them; this is disclosed for the L3/opus validator to re-confirm, not silently worked around.

```
$ npx tsc --noEmit -p tsconfig.app.json   → clean, no errors
$ npm run build                           → Application bundle generation complete
```

### Scope Bounds (honored)

- ✅ No `classifyMicCapture` / R1 / recovery / banner changes — grep-confirmed only the 5 files above
  touched.
- ✅ No classifier (`classifySenderLiveness` — B08A-2), no injection, no UI, no dual-browser call.
- ✅ Exactly one `getStats()` call per surface: `getOutboundLiveness()` own call, and
  `collectDiagnostics()` reuses its single existing call — both proven by `getStatsCalls` counters in
  `sfu-client.spec.ts`.
- ✅ Closes no AC (AC15 closes only at B08A-3, after live far-end transcript).
- ✅ `652c1475` / `TEST_ROOM01` untouched — no harness/room state touched at all, product-code-only
  batch.

### Acceptance Criteria Met

- ✅ Unit tests over synthetic `RTCStatsReport`s: all four counters extracted (U-33), non-number → null
  (U-34), never throws (U-35), no second `getStats()` pass (`sfu-client.spec.ts` counters, both surfaces).
- ✅ Diagnostics payload includes the four fields per outbound audio track (`sfu-client.spec.ts`
  `audioOut?.totalAudioEnergy` / `totalSamplesDuration` assertions), and does not leak onto non-audio
  tracks.
- ✅ Closes no AC.

### Notes for Validator (L3 / opus) / Redteam (standard)

- Confirm the pre-existing `mic-capture-health.spec.ts` line-120 failure is genuinely pre-existing
  (`git stash` at HEAD `08a369c` reproduces it with zero B08A-1 changes applied) and not something this
  batch's edits caused or should have fixed under scope.
- Confirm `collectDiagnostics()`'s merge is read-only onto `SfuOutboundTrackStats` — no control-flow
  branch anywhere reads the new fields (grep for `totalAudioEnergy`/`totalSamplesDuration` outside the
  5 changed files should return nothing new).
- Confirm `getOutboundLiveness()` and the `collectDiagnostics()` merge each fetch `getStats()` exactly
  once (not shared, not double-called) — both are independent call sites by design (harness reader vs.
  app diagnostics), each individually one-shot.
- Confirm no `classifyMicCapture`, `nextMicWarningState`, `decideMicRecovery`, `runMicSweep`, or
  `room.page.ts` R1 wiring line changed.

---

## Summary

B08A-1 adds the sender-liveness stats reader (`getOutboundLiveness()`, one `getStats()` pass) and,
per D29, wires the same four counters into the app's own `collectDiagnostics()` diagnostics payload
per outbound audio track — so a real call's T1 discriminator (capture-dead vs sender-dead) is
diagnosable from production telemetry, not only from the harness. Purely additive: no classifier, no
R1/remedy change, no AC closed. Ready for B08A-2 (`classifySenderLiveness` + dual injection).
