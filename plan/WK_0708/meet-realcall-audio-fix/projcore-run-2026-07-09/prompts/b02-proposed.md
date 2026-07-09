# B02 STATUS: PROPOSED

## Batch ID
B02 — Recording/transcript arbiter and third verdict

## Files & Approach

### Core arbiter module: `e2e/harness/recording-arbiter.ts`
- **LoudnessAnalyzer** class (export first-class loudness API supporting A ratio):
  - `measureVoicedLoudness(audioBuffer: Float32Array, sampleRate: number): { rms: number; lufs: number; }`
  - `computeLoudnessRatio(quietLoudness: Loudness, normalLoudness: Loudness): number` (A definition)
  - RMS calculation: `sqrt(mean(samples²))`
  - LUFS approximation: gate on voiced segments + perceptual weighting (ITU-R BS.1770-4 simplified)

- **RecordingArbiter** class:
  - `analyzeRecording(recordingPath: string): Promise<RecordingAnalysis>`
  - `extractTranscript(recordingPath: string): Promise<TranscriptData>` (hooks to existing transcript logic)
  - `writeVerdict(recordingPath: string, verdict: 'PASS' | 'FAIL' | 'INVALID'): Promise<void>`
  - Reads WAV header + PCM data; delegates to LoudnessAnalyzer
  - Stats logged but never decide verdict alone (verdict requires stimulus verification or explicit INVALID rule)

- **RecordingAnalysis** interface:
  ```typescript
  {
    recordingPath: string;
    voicedSegments: Array<{ start: number; end: number; loudness: Loudness }>;
    loudness: Loudness; // overall voiced RMS/LUFS
    transcriptPath?: string;
    transcriptContent?: string;
    verdict?: 'PASS' | 'FAIL' | 'INVALID';
    verdictReason?: string;
  }
  ```

### Test file: `e2e/harness/__tests__/recording-arbiter.test.ts`
1. **Synthetic known-WAV round-trip test** (acceptance criteria):
   - Generate two synthetic WAVs: one at normal level, one at attenuated level (0.5 gain)
   - Measure both → compute A ratio
   - Verify recording is written to disk + analysis returns expected RMS/LUFS
   - Verify transcript hook is called (mock)
   - Verify `PASS` written when stimulus verified
   - Verify `INVALID` written when stimulus verification missing

2. **Unit tests**:
   - RMS calculation against known test vectors
   - LUFS gate on silent frames (should exclude near-zero samples)
   - Loudness ratio computation (quiet / normal)
   - Verdict logic: INVALID on empty/missing stimulus verification

### Dependencies
- B01 ✓ (call-ledger.ts provides createdIDs registry — used to ensure recordings are tracked for cleanup)
- No new npm dependencies; use Node.js native `fs` + WAV header parsing

### Estimate
25 minutes total
- LoudnessAnalyzer + RecordingArbiter: 12 min
- Test file (synthetic WAV gen + round-trip): 10 min
- Integration check: 3 min

## Binding A Definition Check
✓ Designed loudnessRatio(quietLoudness, normalLoudness) as first-class method
✓ Supports same-speaker normal-vs-attenuated comparison
✓ RMS/LUFS measurements use voiced segments only (frames above noise floor)
✓ Will NOT use "loudest remote" (degenerate in 2-party) — ratio is explicit parameter-driven
