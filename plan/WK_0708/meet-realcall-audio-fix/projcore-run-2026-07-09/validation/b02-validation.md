# B02 Validation — Recording Arbiter

## Verdict: PASS

Validated commits:
- `058af0e` — initial recording/transcript arbiter
- `202f156` — path traversal guard and FAIL/INVALID semantics

## Reproduction

Command:

```bash
cd e2e && npx vitest run harness/__tests__/recording-arbiter.test.ts
```

Result:

```text
Test Files  1 passed (1)
Tests       15 passed (15)
```

Additional adversarial check:

```bash
cd e2e && npx tsx -e "<one-off path traversal check>"
```

Result:

```json
{"analyzeRejected":true,"writeRejected":true,"sidecarExists":false}
```

## Required Checks

1. Path traversal rejected for paths outside `baseDir`: PASS
   - `validatePath()` resolves input and base, then rejects any resolved path outside the base prefix.
   - `analyzeRecording()` calls `validatePath()` before `fs.readFileSync()`.
   - `writeVerdict()` calls `validatePath()` before deriving/writing the sidecar path.
   - One-off check confirmed both outside analyze and outside verdict write are rejected, and no outside sidecar is created.

2. `withinTolerance === false` returns `FAIL`, not `INVALID`: PASS
   - `determineVerdict()` returns `FAIL` when stimulus verification exists but is out of tolerance.
   - Committed test `should create a FAIL verdict when stimulus verification is out of tolerance` asserts this.

3. Missing stimulus returns `INVALID`: PASS
   - `determineVerdict()` returns `INVALID` when `stimulusVerification` is absent.
   - Committed test `should create an INVALID verdict when stimulus verification is missing` asserts this.

4. `computeLoudnessRatio` is explicit quiet/normal, not loudest-remote: PASS
   - API is `computeLoudnessRatio(quietLoudness, normalLoudness)`.
   - Implementation returns `quietLoudness.rms / normalLoudness.rms`.
   - Tests cover both direct quiet/normal inputs and synthetic normal/quiet WAV round-trip.

5. Stats never sole PASS: PASS
   - `determineVerdict()` does not return PASS from `RecordingAnalysis` stats alone.
   - PASS is returned only when stimulus verification exists and `withinTolerance` is true.
   - Missing stimulus test analyzes a real WAV with loudness stats and still receives `INVALID`.

## Notes

`validation/b02-changes.md` is stale relative to `202f156`: it still describes out-of-tolerance stimulus verification as `INVALID`. The actual code and committed tests at `202f156` implement the corrected `FAIL` behavior.

STATUS: DONE
