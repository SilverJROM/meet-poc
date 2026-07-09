# B07 Validation — Mode-A/Mode-B capture injection contracts

**Commit:** pending
**Date:** 2026-07-09
**Test Status:** 11/11 passing (9 unit + 2 real-Chromium mechanism proof)

## Verdict: MECHANISM PROVEN BY MEASUREMENT (real Chromium, not mocks). AC4/AC5 explicitly OPEN.

### Implementation Summary

B07 delivers the reusable **capture injection contract** (Mode A frozen-nonzero, Mode B silent,
harness-controlled switch to a known fixture) that B13/B14 will drive against the app's real
`classifyMicCapture`/R1 self-heal logic in a live 2-party call. Per D27, this batch stays at the same
evidence tier as D19/B05 (real Chromium + real fake-audio-capture device, blank local HTTP page, no
room join) — it does **not** claim AC4 or AC5 are closed, and burns **0/25** call budget.

### Files Added

1. **`e2e/harness/capture-injection.ts`**
   - `CaptureMode`, `CaptureInjectionTimeline`, `buildInjectionTimeline` (pure contract).
   - `classifyHoldPhaseSignature(levels, opts?)` (pure) — mirrors `mic-energy.ts`'s
     `MIC_SILENCE_LEVEL_THRESHOLD` (0.01) and the `856104f` variance check (`< 0.005`) exactly, so
     the harness's "frozen"/"silent" notion cannot silently drift from the app's.
   - `T_GAP_PROVISIONAL_MS = 500` — PROVISIONAL wiring default only (D27); never cited as measured
     or used to gate a verdict anywhere in this batch.
   - `modeAInitScript(params)`, `modeBInitScript(params)` — Playwright `addInitScript`-injectable,
     self-contained page-context functions, same D19 wrapping pattern (`getUserMedia` swapped,
     downstream `AudioContext` graph). Mode A: `ConstantSourceNode(offset=frozenLevel)` hold phase
     → decoded fixture. Mode B: `ConstantSourceNode(offset=0)` hold phase → decoded fixture.

2. **`e2e/harness/__tests__/b07-capture-injection.test.ts`** (9 tests, pure/node, no browser)
   - Timeline default/override behavior.
   - `classifyHoldPhaseSignature` against the real frozen-level value from session `652c1475`
     (`0.2289...`), silent windows, genuinely-varying windows, boundary conditions (exact threshold
     edges), custom threshold overrides.

3. **`e2e/harness/__tests__/b07-capture-injection.browser.test.ts`** (2 tests, real Chromium)
   - Mode A: hold phase measured `'frozen-nonzero'` on a real captured-then-synthesized track;
     post-switch level differs from hold level by >20% (a real state change, not a stuck hold).
   - Mode B: hold phase measured `'silent'` (below `MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD`);
     post-switch level crosses back above the silence threshold.
   - Explicit in-file disclosure of evidence scope: no `RTCPeerConnection`, no SFU, no far-end
     `getStats()`, no transcript — none of that is claimed.

4. **`decisions/b07-findings.md`** — full findings: DC-offset survived cleanly on measurement
   (contra the proposal's flagged risk), an onset-transient pitfall + fix, and the **important**
   discovery that the existing `bot-speech` fixtures are synthetic sine tones with no phonetic
   content — they cannot produce a transcribable word, which directly blocks AC4/AC5's evidence
   requirement until real speech content exists. Flagged as OPEN, feeding B13/B14.

### Files Modified

- **`e2e/harness/index.ts`** — added `capture-injection.ts`'s exports alongside `gum-shim.ts`'s.

### Test Results (11/11 PASS)

```
✓ harness/__tests__/b07-capture-injection.test.ts (9 tests)
✓ harness/__tests__/b07-capture-injection.browser.test.ts (2 tests)
  ✓ Mode A: hold phase reads frozen-nonzero on a real track, post-switch reads a measurably different level
  ✓ Mode B: hold phase reads silent on a real track, post-switch is measurably no longer silent
```

Full harness suite re-run for regressions: `npx vitest run harness/__tests__` → 68/68 passing across
8 files; the only failure is the **pre-existing** `call-ledger.test.ts` (F4, logged at B05
byte-identical at `df13135^` — hand-rolled `test()`/`process.exit()`, registers zero vitest suites;
not touched or caused by B07).

### Scope Bounds (honored)

- ✅ No app changes — `mic-energy.ts`, `media.service.ts` untouched (read-only grounding only;
  thresholds mirrored, not imported, since the harness has no build dependency on the frontend
  package).
- ✅ No live room join, no SFU, no real call — mechanism proof only, same tier as D19/B05.
- ✅ No transcript wiring — `RecordingArbiter.extractTranscript()` untouched.
- ✅ No AC4/AC5 verdict anywhere in code, tests, or this report.
- ✅ `T_gap_provisional=500ms` used only as an overridable wiring default (`T_GAP_PROVISIONAL_MS`),
  never presented as measured or gating.
- ✅ Call budget: **0/25 burned** — no `browser.newContext()` against a real room URL/login flow
  anywhere in this batch.

### Acceptance Criteria Met

- ✅ Harness can create a Mode A signature (frozen, non-zero, near-zero variance) on a real captured
  track in real Chromium — measured, not asserted (`0.15000000596046204` RMS, flat across every
  window).
- ✅ Harness can create a Mode B signature (literal zero-level silence) on a real captured track in
  real Chromium — measured.
- ✅ Harness can switch to known speech on a harness-controlled timer, and the post-switch signal is
  measurably different (>20% level change for Mode A; crosses the silence threshold for Mode B).
- ✅ `decisions/b07-findings.md` states plainly that AC4/AC5's far-end-transcript proof is OPEN,
  owned by B13/B14, not closed here — and additionally surfaces that the fixture content itself
  (synthetic tones, no words) blocks that proof until real speech content exists.
- ❌ Not in scope, not claimed: AC4 or AC5 VERIFIED.

### Notes for Validator (L3) / Redteam (standard)

- Confirm the mechanism-proof test launches **real Chromium** (`chromium.launch`) with
  `--use-file-for-fake-audio-capture`, not JS mocks standing in for the audio pipeline.
- Confirm no assertion, comment, or report line anywhere in this batch claims AC4/AC5 VERIFIED or
  implies a transcript was produced.
- Confirm `T_GAP_PROVISIONAL_MS`/`holdDurationMs` are never used to gate a PASS/FAIL in this batch's
  own tests (they are timeline inputs only; assertions are all measured-level comparisons).
- Confirm the call budget line reads 0/25 (no room join in either test file).
- Confirm `classifyHoldPhaseSignature`'s thresholds (`0.01`, `0.005`) match
  `mic-energy.ts:29,188` exactly — a silently-drifted mirror is a redteam-worthy finding.
- Confirm Finding 3 (synthetic-tone fixtures) is read as a genuine, measured finding (RMS values
  given) and not an unverified claim.

---

## Summary

B07 delivers a measured, real-Chromium-proven Mode A/Mode B capture injection contract, ready for
B13/B14 to drive against the app's real recovery logic in a live call. Two genuine technical findings
surfaced during implementation (DC survives cleanly; onset-transient sampling pitfall + fix) and one
important blocker was discovered and documented rather than silently worked around (the bot-speech
fixtures cannot produce transcribable words). No AC4/AC5 claim is made. Tests emit DONE with 11/11
passing.
