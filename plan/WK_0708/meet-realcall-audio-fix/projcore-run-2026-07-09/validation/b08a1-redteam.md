# Red-Team Verdict: B08A-1 (sender-liveness stats reader + diagnostics emit)

**Verdict: CLEAN**

Red-team panelist: agj (read-only adversarial review, verifier ≠ fixer)

---

## Rotation Through Lenses

### 1. Wrong-Side Stats (Capture vs Playout)

✅ **PASS**: Stat sources are correct per T1 discriminator semantics.

- **Capture side:** `media-source`/`kind === 'audio'` → `totalAudioEnergy`, `totalSamplesDuration` (mic production side)
- **Sender side:** `outbound-rtp`/`kind === 'audio'` → `packetsSent`, `bytesSent` (WebRTC transmission side)
- No playout-side reading (inbound-rtp) — correct, this is sender-liveness only (D28/D29 scope)
- Test fixture verifies: audio outbound-rtp track receives capture-side stats, video track does NOT (`undefined`)

### 2. Second `getStats()` Call

✅ **PASS**: Both surfaces call `getStats()` exactly once.

- **`getOutboundLiveness()`**: one `pc.getStats()` call, delegates to extractor, null-safe on any error
- **`collectDiagnostics()`**: reuses one pre-fetched stats report (already on line ~1200), calls `extractOutboundLiveness(stats)` on same object (no second call)
- Test assertions proven: `getStatsCalls === 1` for both surfaces; missing-stat case asserts `null` (not `undefined`)
- No redundant stats fetches; no stat loops

### 3. Silent Throw Swallowing

✅ **PASS**: Error handling is intentional and consistent.

- `getOutboundLiveness()`: try/catch returns `null` on `getStats()` error — intentional null-safe design for optional diagnostics reader
- `extractOutboundLiveness()`: pure extractor, zero error-throwing operations (`typeof` checks are safe, `for...of` is safe)
- Pattern matches sibling `getOutboundAudioSource()` and codebase conventions

### 4. Diagnostics Not Actually on Payload Path

✅ **PASS**: D29 fields flow into the diagnostics payload.

- Capture-side fields merged into `SfuOutboundTrackStats` object at construction time (inside the track object literal)
- Track object pushed to `outboundTracks` array (line ~1260)
- `outboundTracks` is part of the returned diagnostics snapshot (`SfuDiagnosticsSnapshot`)
- Test assertions verify merge: `audioOut?.totalAudioEnergy === 91.2`, `videoOut?.totalAudioEnergy === undefined`
- Payload path proven correct

### 5. Sonnet Overclaim (Commit Message Accuracy)

✅ **PASS**: All claims verified against implementation.

| Claim | Evidence |
|-------|----------|
| "ONE getStats() pass" | Call counting in tests; no second pass in `collectDiagnostics()` |
| "capture-side (media-source: totalAudioEnergy, totalSamplesDuration)" | Extractor lines 41-44; stat type & kind checks correct |
| "sender-side (outbound-rtp audio: packetsSent, bytesSent)" | Extractor lines 45-47; stat type & kind checks correct |
| "merge...onto each outbound audio track" | Spread operator line 1261–1264; `stat.kind === 'audio'` ternary correct |
| "reader+emit only — no classifier, no R1/remedy touch" | Grep verified: no `classifyMicCapture`, `nextMicWarningState`, `decideMicRecovery`, `runMicSweep`, `room.page.ts` changes |
| "closes no AC" | Explicit in changes.md; AC15 closes only at B08A-3 (live far-end validation) |

---

## Scope Bounds (Verified)

✅ Only 5 product files modified (no extraneous planning-doc churn):
1. `mic-energy.ts` — new extractor, consistent with `extractOutboundAudioSource` idiom
2. `sfu-client.service.ts` — new public reader + D29 merge (no control-flow branches on new fields)
3. `meeting-sessions.service.ts` — additive schema (two optional nullable fields for audio tracks only)
4. `mic-capture-health.spec.ts` — U-33, U-34, U-35 unit tests (pure extractor, all-null fallback, non-number handling)
5. `sfu-client.spec.ts` — extended fixture with media-source stat + merged-field assertions + standalone getOutboundLiveness tests

No hidden changes to R1 wiring, classifiers, or recovery logic.

---

## Design Observations (Not Findings)

**Simulcast coverage:** Test fixture has one audio outbound-rtp track. The merge design (apply same capture-side values to all audio tracks) is correct for simulcast scenarios (single mic → multiple tx layers), but not explicitly tested. However, the code structure is sound and test coverage for single-track case is complete.

**NaN handling:** Code accepts `typeof === 'number'` (includes NaN), consistent with sibling `extractOutboundAudioSource`. This is documented in changes.md as deliberate consistency; not a defect.

**Redundant sender-side extraction:** `extractOutboundLiveness()` reads `packetsSent`/`bytesSent` from the first audio outbound-rtp (for standalone harness reader), but `collectDiagnostics()` overrides with per-track values from the loop. This is inefficient but acceptable: two independent call sites (harness vs. app) → shared extractor signature → value discarded in one path. Not a correctness issue.

---

## Verdict Summary

✅ **CLEAN** — No correctness defects, no scope violations, no payload-path gaps.

Ready for B08A-2 (sender-liveness classifier + dual injection).

---

**Red-team panelist:** agj  
**Date:** 2026-07-09  
**Commit:** `0ca6670`  
**Level:** DIFF-level (extractor logic + payload merge + test coverage)
