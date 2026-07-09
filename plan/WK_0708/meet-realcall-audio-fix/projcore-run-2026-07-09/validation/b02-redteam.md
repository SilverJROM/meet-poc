# B02 Red-Team Validation — Recording Arbiter

**Commit**: 058af0e (feat: recording/transcript arbiter with loudness analysis and verdict)

**Reviewed**: e2e/harness/recording-arbiter.ts + e2e/harness/__tests__/recording-arbiter.test.ts

---

## Findings

### 1. PATH TRAVERSAL — recordingPath / verdictPath (HIGH)

**Location**: `recording-arbiter.ts:218` (analyzeRecording), `recording-arbiter.ts:281` (writeVerdict)

**Vulnerability**: 
- `recordingPath` parameter passed directly to `fs.readFileSync(recordingPath)` with no path validation
- `verdictPath = recordingPath + '.verdict.json'` written directly to `fs.writeFileSync()` with no path validation
- Attacker can pass `recordingPath = "../../../../etc/passwd"` to read arbitrary files
- Attacker can pass `recordingPath = "../../sensitive/.../../app/secrets.wav"` to write verdict files to arbitrary locations

**Example attack**:
```typescript
await arbiter.analyzeRecording("../../../../etc/passwd");  // Reads /etc/passwd
await arbiter.writeVerdict("../../config/override.wav", "PASS", "forged");  // Writes outside intended tree
```

**Severity**: HIGH — Cross-directory file I/O via unvalidated path parameters.

---

### 2. INVALID / FAIL DISTINCTION — Verdict Ambiguity (MEDIUM)

**Location**: `recording-arbiter.ts:296-322` (determineVerdict)

**Issue**:
- Function signature declares return type: `'PASS' | 'FAIL' | 'INVALID'`
- Implementation never returns `FAIL`
- Both missing stimulus verification AND failed stimulus verification return `INVALID`
- Test at line 244-261 confirms: out-of-tolerance verification → INVALID (not FAIL)

**Current logic**:
- Line 301-306: No stimulus verification → INVALID
- Line 309-314: `withinTolerance === false` → INVALID (same verdict as missing data)
- Line 318-321: `withinTolerance === true` → PASS

**Semantic problem**: 
- INVALID conflates two different failure modes: "no data" vs. "data present but failed"
- Caller cannot distinguish whether a recording is unverifiable or explicitly failed
- Fail-open risk: external system might treat INVALID as "inconclusive, retry later" rather than "verification failed, reject"

**Design intent** (from comment line 292-295):
- "Stats never decide PASS alone"
- "PASS only when stimulus verification confirms expected gain"
- Implies: any recording without passing verification should not be PASS

**But the distinction matters**:
- Missing verification → INVALID (can't verify)
- Verification failed → FAIL (verification ran, gain is wrong)
- Stimulus OK → PASS (gained correctly)

**Severity**: MEDIUM — Verdict semantics could mislead callers about root cause; allows fail-open if treated as retriable.

---

## Clean Items

✓ **RMS/LUFS calculation**: Correct sine-wave math, -Infinity handling for silence, no divide-by-zero.
- Line 52-60: measureRMS guards empty array
- Line 64-88: measureLUFS checks `voicedRMS <= 0` before log10
- Line 103: computeLoudnessRatio checks `normalLoudness.rms === 0` → returns 0

✓ **Silent frames not counted as voiced**: SILENCE_THRESHOLD gating (0.0001) correctly excludes subsonic noise.
- Line 70-73: extractVoicedSegments gates on threshold
- Line 115: isVoiced check uses strict `>` comparison
- Tests confirm silence segmentation (line 95-118, 278-330)

✓ **A-ratio logic**: Uses per-speaker same-signal attenuation (quiet / normal), not "loudest remote" cross-channel hybrid.
- Line 99-106: computeLoudnessRatio takes (quietLoudness, normalLoudness) and returns RMS ratio
- Line 206-209: Round-trip test validates expected 0.5 gain

✓ **Stimulus verification gates PASS**: Stats alone never decide PASS.
- Line 296-299 comment explicit
- Line 301-321 requires stimulusVerification.withinTolerance === true for PASS
- Tests confirm (line 212-223, 225-242, 244-261)

---

## Summary

**Status**: FINDINGS

**Actionable**:
1. Path traversal (HIGH) — validate/normalize recordingPath and verdictPath using `path.resolve()` + whitelist check
2. FAIL vs INVALID (MEDIUM) — return FAIL when `withinTolerance === false`; INVALID only when stimulusVerification is undefined

**Non-blockers**: Loudness math, silence gating, RMS safety, A-ratio logic all correct.
