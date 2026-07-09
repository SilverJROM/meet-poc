# B02 SEND-BACK — redteam findings fix (impl L2 haiku)

Two findings from validation/b02-redteam.md. Fix only these. Do not expand scope.

## 1. Path traversal (HIGH)
`analyzeRecording` / `writeVerdict` use raw `recordingPath` with fs read/write.
- Resolve with path.resolve
- Require path is under an allowed base (e.g. process.cwd() / e2e harness tmp / explicit baseDir ctor option)
- Reject paths that escape allowed root (throw or return INVALID)
- Same for verdictPath derived from recordingPath

## 2. FAIL vs INVALID (MEDIUM)
In determineVerdict:
- missing stimulusVerification → INVALID
- withinTolerance === false → **FAIL** (not INVALID)
- withinTolerance === true → PASS
Update tests accordingly (out-of-tolerance → FAIL).

## Handshake
PROPOSED short → wait APPROVED-PLAN → fix → vitest → commit → [projcore callback] impl B02 STATUS: DONE
