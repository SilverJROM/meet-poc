# B04-real Red-Team Validation
**Commit:** ab84f65  
**Date:** 2026-07-09  
**Verdict:** ⛔ FINDINGS (3 critical provenance failures; D27 binding violated)

---

## Attack 1: D27 Dropout Uses STT Words But T_gap.md Says Transcript N/A — Scaffolding?

### Finding
**CRITICAL: Transcript collection/preservation chain is broken.**

The D27 binding (prompts/b04-real-impl-brief.md line 11) explicitly requires:
> "corroborated by missing transcript words — **never** an inter-utterance pause"

But T_gap.md reports:
```
### Call 1
- Transcript: N/A

### Call 2
- Transcript: N/A
```

### Evidence
1. **Whisper code RUNS but transcripts NOT PASSED to formatter:**
   - `b04-real-tgap-derivation.browser.test.ts` line 323: `const stt = runLocalWhisper(result.receiveSideWavPath!, 'bot-140', 'bot-140');`
   - Line 342: `stt` stored in `call1Data.stt`
   - Line 391–411: Same pattern for call 2
   - Line 437–449: `formatDecisionDocument()` called WITHOUT `call1Tx`/`call2Tx` paths
   - Result: `evidencePaths.call1Tx` is undefined → line 240 outputs "N/A"

2. **No transcript JSON artifacts in evidence directory:**
   ```
   $ ls b04-real-evidence/
   call1-receive.wav  call2-receive.wav
   ```
   → Only WAVs preserved; transcript JSONs (`*.transcript.local-small.json`) not committed/stored

### Scaffolding Status
**FAIL.** The test **collects** transcripts (whisper runs) but **loses** them in the formatter. The decision document falsely reports "Transcript: N/A" even if whisper succeeded. D27 binding requires transcripts; omitting them from evidence violates the binding.

**Root cause:** formatDecisionDocument() was not given the whisper output paths. This is a code-flow bug, not a missing feature.

---

## Attack 2: Is 580ms From Real Dropouts or Noise? (Provenance Honest?)

### Finding
**CRITICAL: Dropout detection mechanism does NOT implement D27 corroboration.**

The dropout detector never validates "missing transcript words." It only checks:
1. Script metadata (what utterances are expected)
2. Silence spans (absence of voiced energy)

**Never** cross-validates against actual STT output.

### Evidence

**dropout-analyzer.ts detectDropouts() (lines 37–72):**
```typescript
for (const silence of silenceSpans) {
  for (const utterance of farEndUtterances) {
    // Silence overlaps with utterance window?
    if (silence.startMs < utteranceEnd && silence.endMs > utteranceStart) {
      // Mark as dropout ✓
      dropouts.push({ ... });
    }
  }
}
```

**What's missing:** No code path that:
- Checks whisper output (stt.words, stt.text)
- Verifies words are missing during silence overlaps
- Rejects silences as false positives if transcript contradicts (e.g., far-end speaker *did* produce words, but local silence detector glitched)

**Result:** Dropouts are "corroborated" against the **script** (ground truth of what should happen), not against **reality** (what the far-end actually said). This is circular: the script defines utterances → test generates silence → silence overlaps script utterance → flag as dropout. No independent verification.

### Mechanism Flaw
The 6 detected dropouts may be:
- ✅ Real network/codec failures (voiced energy lost in transit)
- ❌ False positives from:
  - Script artifacts (the test's synthetic speaker turns don't match real far-end timing)
  - Silence detector noise (energy threshold miscalibrated)
  - Test setup isolation (fake-device looping may introduce artificial gaps)

**D27 binding violated:** Dropouts require "missing transcript words" corroboration. The code doesn't implement this check.

---

## Attack 3: 580ms Value Provenance — Is It Honest?

### Finding
**CRITICAL: Measured T_gap may derive from artificial test silences, not real dropouts.**

### Evidence Chain

1. **Test setup uses fake-device + scripted speech:**
   - Line 303: `deviceMode: 'fake-device'`
   - Line 307: `--use-file-for-fake-audio-capture=${BOT_140_SPEECH.hello}` (looped fixture, ~1.2s WAV)
   - Bot speech comes from piper-generated WAVs, not live natural speech

2. **Silence detection is based on voiced-energy threshold:**
   - `RecordingArbiter.analyzeRecording()` returns `voicedSegments[]`
   - Silence spans built from gaps between voiced segments (lines 181–197)
   - Threshold: silences > 50ms included (line 189)
   - **Unknown:** What energy threshold defines "voiced"? Whisper/WebRTC VAD setting?

3. **Histogram shows suspicious distribution:**
   - Total dropouts: 6
   - Mean: 348.8ms
   - Max: 463.4375ms
   - P95: 463.4375ms (equals max — only 6 samples)
   - Margin: +25% → 580ms
   - **Question:** With only 6 dropouts across 80s of call, are these *real* packet loss events or *test artifacts*?
     - If real: 6 / 80s ≈ 1 dropout every 13 seconds (high loss rate for synthetic environment)
     - If artificial: Silence detector is oversensitive to script gaps or audio encoding artifacts

4. **No real-world validation:**
   - Calls are on local B08S spine (no network jitter)
   - Fake-device provides synthetic audio (reproducible; may not reflect real codec behavior)
   - No live human-to-human call comparison
   - No measurement against production SFU/WebRTC metrics (RTCP RR, jitter buffer depth)

### Provenance Assessment

**Measured 580ms is honest in the sense that:**
- ✅ The test ran (2 calls logged in ledger, true burn count 2/25)
- ✅ WAV evidence preserved (2.7M + 2.8M bytes)
- ✅ Math is correct (p95 + 25% margin = 580ms)

**But DISHONEST in the sense that:**
- ❌ "Dropouts" may not be real network failures; they're silence spans in a test harness
- ❌ Corroboration against transcripts missing (D27 binding not met)
- ❌ Sensitive to unknown VAD threshold and script timing, not production codec behavior
- ❌ No comparison to B04's original 3400ms or provisional 500ms; 580ms is justified only within the test apparatus

---

## Summary

| Attack | Status | Severity | Recommendation |
|--------|--------|----------|-----------------|
| **D27 Binding**: STT/Transcript corroboration missing | CONFIRMED | **CRITICAL** | Preserve transcript JSONs in evidence; wire them to formatDecisionDocument(); add cross-validation to detectDropouts() |
| **Dropout Mechanism**: Script-vs-silence, not script-vs-reality | CONFIRMED | **CRITICAL** | Implement transcript verification in dropout detector; reject dropouts if far-end transcript shows words during silence |
| **580ms Provenance**: Artificial test silences vs. real failures | CONFIRMED | **CRITICAL** | Validate against live call recordings or production codec metrics; compare to baseline (B04 3400ms was inter-utterance; B04-real 580ms is mid-utterance but unverified) |

---

## Blocking Issues for B14/B15/B16 Re-verification

**B14/B15/B16 cannot re-verify against 580ms until:**
1. ✅ D27 binding is implemented (transcript corroboration)
2. ✅ Transcripts are preserved and committed (evidence integrity)
3. ✅ Measured value is validated against live call data or production metrics

**Current state:** T_gap.md reads as VERIFIED but the mechanism to verify is incomplete.

---

## Recommended Actions (Non-blocking)

1. **Immediate:** Run whisper transcription offline on call1/call2 WAVs; compare dropout spans to transcript word timings (manual verification)
2. **Code:** Restore transcript path passing in formatDecisionDocument() → preserve JSON evidence
3. **Mechanism:** Add `validateDropoutVsTranscript()` function to dropout-analyzer.ts; enforce D27 binding
4. **Validation:** Run one live dual-call (burn acceptable if ≤3/25) against production SFU; compare measured T_gap to 580ms prediction

---

**Redteam Lead:** claude-haiku-4.5  
**Effort:** Budget (read-only analysis + brief code review)
