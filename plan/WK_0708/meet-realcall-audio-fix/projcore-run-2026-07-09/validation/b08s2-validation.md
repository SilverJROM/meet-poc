# B08S-2 Independent Validation

**Validator:** L2 codex55  
**Verifier != fixer:** yes  
**Implementation:** haiku, commit `5d7f652`  
**Verdict:** FAIL

## Result

B08S-2 does not pass validation. The harness tests are green and the WAV encoder output is parseable, but `captureReceiveSideAudio()` is not a trustworthy live receive-side recorder. It writes synthesized tone/noise even when no remote audio was captured, which can false-green downstream live AC validation.

## Checks

1. **Harness tests:** PASS
   - Ran: `npx vitest run e2e/harness/__tests__/`
   - Result: 11 test files passed; 100 tests passed; 2 skipped.

2. **WAV parseable by `RecordingArbiter.analyzeRecording()`:** PASS mechanically
   - The encoder-generated WAV path is parseable by `RecordingArbiter`.
   - Validator probe also confirmed the recorder can emit a parseable WAV.

3. **Transcript labeled `scriptExpected`; path returned on `CallResult`:** PASS
   - `writeTranscriptFile()` writes `# Receive-side transcript (script-sourced, labeled scriptExpected)`.
   - `CallResult` includes `transcriptPath` and `transcriptContent`.

4. **CallLedger remains only `room | session`:** PASS
   - `CreatedIDType = 'room' | 'session'`.
   - No `registerCreatedID()` usage for WAV or transcript artifact paths.

5. **Receive-side capture is real remote `MediaStream` path, not synthetic-only stub:** FAIL
   - `captureReceiveSideAudio()` wraps future `RTCPeerConnection` constructors inside `page.evaluate()`, but it is called after both browsers have already joined; it does not capture existing peer connections.
   - Any captured WebM buffer is discarded. The function then generates local synthetic audio via `generateStubAudio()` and writes that WAV.
   - On no recorder/no track, it resolves `{ buffer: '', durationMs: 0 }`, then falls back to `durationMs || 1000`, producing a one-second synthetic voiced WAV.
   - Validator probe with a fake page returning no captured audio still produced a parseable voiced WAV:
     - `durationMs: 1000`
     - `voicedSegments: 12`
     - `rms: 0.21437894221805967`
     - file size: `96044`
   - This proves the implementation can false-green live ACs without receiving any remote audio.

6. **Closes no AC:** PASS
   - The changes file and callback state this is evidence-pipe scope only.
   - No AC should be closed from B08S-2.

## Blocking Finding

`e2e/harness/receive-side-recorder.ts:121-127` is the blocker:

```ts
const duration = audioBuffer.durationMs || 1000;
const stubSamples = generateStubAudio(duration);
const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
const wavBuffer = encoder.encode(stubSamples);
```

This replaces real receive-side evidence with synthetic audio and is not fail-closed. Downstream consumers cannot distinguish a real remote recording from a recorder that saw no remote track.

## Required Fix

Make `captureReceiveSideAudio()` fail closed unless it records actual remote audio from the receiving browser. Do not synthesize a WAV for live receive-side evidence. If using `MediaRecorder`, preserve and transcode real captured data or clearly return an invalid/no-capture result that downstream AC gates cannot treat as evidence.
