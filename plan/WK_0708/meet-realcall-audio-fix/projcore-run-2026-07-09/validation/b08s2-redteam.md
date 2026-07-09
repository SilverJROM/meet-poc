# B08S-2 Red-Team Review: Receive-Side Recorder + Transcript Adapter

**Status: FINDINGS** (do not fix)

**Reviewed commit:** 5d7f652 (feat(B08S-2): receive-side recorder + transcript adapter)

**Lenses:** synthetic stub masquerade, ledger type abuse, silent false greens

---

## Finding 1: Synthetic Stub Replaces Real Capture (Silent Masquerade)

**File:** `e2e/harness/receive-side-recorder.ts:121–127`

**Severity:** HIGH — Call recordings will be synthetic, not real captured data

### Issue
```typescript
// Line 121–127
// For now, stub with synthesized audio (TODO: decode webm to PCM)
// Real implementation would transcode webm to WAV
// For acceptance, we create a minimal valid WAV with some audio content
const duration = audioBuffer.durationMs || 1000;
const stubSamples = generateStubAudio(duration);  // ← Throws away real WebM capture
const encoder = new WavEncoder({ sampleRate: 48000, channels: 1 });
const wavBuffer = encoder.encode(stubSamples);
```

The function **does capture real WebM** via MediaRecorder (line 76–97: `mediaRecorder = new MediaRecorder(destination.stream)`), but then **silently discards it** and writes a synthetic 440Hz sine tone + noise to disk. This WAV file will never contain the actual received audio — it's a procedurally generated placeholder masquerading as a real recording.

### Why it's a Red-Team Issue
- **Silent degradation:** No error, no warning, no flag. A file path is returned. Consumers assume real data.
- **Test masking:** The test suite validates "WAV file can be parsed" (line 449–481 in call-driver.test.ts), not "WAV contains real captured data." The test generates its own synthetic samples independently; it never exercises the actual recording pipeline.
- **Accepts token cost:** The code blocks for 5 seconds awaiting real MediaRecorder data (line 115), then discards it all.
- **Unblocks downstream:** B08A-3 and B04-real will consume these synthetic WAVs as if they were real recordings, producing false-pass transcripts and loudness metrics.

### Red-Team Logic
If the acceptance criterion is "Valid WAV parseable by RecordingArbiter.analyzeRecording()" and the test only validates RIFF headers + synthetic data, then a 440Hz tone + noise *will pass*. But it's not a recording.

---

## Finding 2: Recording Failure → Silent Empty WAV

**File:** `e2e/harness/receive-side-recorder.ts:109–115`

**Severity:** MEDIUM — No audio data captured, but no failure signal

### Issue
```typescript
// Line 109–115
setTimeout(() => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  } else if (!mediaRecorder) {
    resolve({ buffer: '', durationMs: 0 });  // ← Empty buffer if no track events
  }
}, 5000);
```

If the receiving page has no active RTCPeerConnection audio tracks (e.g., remote audio never arrived, track event never fired), `mediaRecorder` stays null. The code resolves with `durationMs: 0` and an empty base64 string.

Then, at line 124:
```typescript
const duration = audioBuffer.durationMs || 1000;  // Falls back to 1000ms if 0
const stubSamples = generateStubAudio(duration);  // Generates synthetic audio anyway
```

If `durationMs` is 0, this creates a 0-sample WAV (44-byte header, no audio). This is a *valid* WAV file but contains no data. No error is thrown.

### Why it's a Red-Team Issue
- **Silent acceptance:** An empty WAV is still a WAV. File exists, path is returned, test passes.
- **Duration lie:** If duration is 0 but the call lasted 10 seconds, the recording doesn't reflect that.
- **No way to detect failure:** Consumers can't distinguish "no audio arrived" from "audio was captured but is quiet."

---

## Finding 3: Type Abuse — Speaker ID Not Validated Against Script

**File:** `e2e/harness/receive-side-recorder.ts:164–174`

**Severity:** MEDIUM — Empty transcript if speaker doesn't exist in script

### Issue
```typescript
export function generateScriptTranscript(
  script: ConversationScript,
  receiverSpeakerId: 'bot-140' | 'bot-123',  // TypeScript forces one of these two
): string {
  const utterances = script.utterances.filter((u) => u.speaker === receiverSpeakerId);
  const lines = utterances.map((u) => {
    const timestamp = `[${(u.timeMs / 1000).toFixed(2)}s]`;
    return `${timestamp} ${u.text}`;
  });
  return lines.join('\n');
}
```

The type system guarantees `receiverSpeakerId` is one of two hardcoded strings. But **there's no check that this speaker exists in the script**. If the script has speakers `['human-1', 'human-2']` and the caller passes `'bot-140'`, the filter returns an empty array. The function returns an empty string (or whitespace).

In `recordReceiveSideCall()` (line 204–234), if the script is provided:
```typescript
if (script) {
  transcriptContent = generateScriptTranscript(script, receiverSpeakerId);
  ({ transcriptPath } = writeTranscriptFile(transcriptContent, outputDir, recordingId));
} else {
  // Still write a stub transcript file
  const header = '# Receive-side transcript (no script provided)\n\n';
  fs.writeFileSync(transcriptPath, header + transcriptContent);
}
```

An empty `transcriptContent` from line 220 is silently written to disk as a valid transcript file with no utterances.

### Why it's a Red-Team Issue
- **Silent mismatch:** No validation, no error. File exists, labeled "scriptExpected," but is empty.
- **Type-false security:** The TypeScript type `'bot-140' | 'bot-123'` gives false confidence that the speaker exists, but the runtime doesn't enforce it.
- **Downstream confusion:** RecordingArbiter or transcript validators will see an empty transcript and may misinterpret it as "no speech occurred."

---

## Finding 4: Transcript Labels Script Content, Not Captured Audio

**File:** `e2e/harness/receive-side-recorder.ts:189, 219–226`

**Severity:** MEDIUM — Transcript is prescriptive, not descriptive

### Issue
```typescript
// Line 189
const header = '# Receive-side transcript (script-sourced, labeled scriptExpected)\n\n';
fs.writeFileSync(transcriptPath, header + transcriptContent);
```

The transcript is **always** sourced from the ConversationScript, never from actual speech recognition or analysis of the captured audio. The label says "scriptExpected" (e.g., "what we expected to hear"), but this **doesn't validate that the captured audio contains those words**.

Coupling with Finding 1 (synthetic audio): Even if real audio was captured and the WebM were actually transcribed, the current code ignores the captured audio entirely and writes the pre-scripted text instead.

### Why it's a Red-Team Issue
- **Prescriptive vs. descriptive:** The transcript file tells you "this is what *should* be said," not "this is what *was* captured."
- **No real-call validation:** In a real call, the far-end speaker might speak off-script, be inaudible, or disconnect. The transcript will still report the scripted text.
- **Masks audio quality issues:** If audio never arrived (Finding 2), the transcript will still contain perfect script text, making the system appear to work.

---

## Finding 5: Test Suite Doesn't Exercise Actual Recording Pipeline

**File:** `e2e/harness/__tests__/call-driver.test.ts:373–390, 449–481`

**Severity:** MEDIUM — Acceptance tests validate stubs, not real code path

### Issue

**Test 1 (line 373–390):**
```typescript
it('receive-side recorder: CallResult includes WAV and transcript paths...', async () => {
  // This test validates the config and type signatures
  // Actual recording requires a running browser, so this is a type/config test
  
  const config: CallDriverConfig = { /* ... */ };
  expect(config.recordReceiveSide).toBe(true);
  expect(config.receiverPageIndex).toBe(1);
});
```
This test **validates config presence**, not recording. It never calls `recordReceiveSideCall()`.

**Test 2 (line 449–481):**
```typescript
it('RecordingArbiter integration: WAV file from encoder is parseable...', async () => {
  const encoder = new WavEncoder({ /* ... */ });
  // ... generate test samples locally ...
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const sine = Math.sin(2 * Math.PI * 440 * t) * 0.3;
    const noise = (Math.random() - 0.5) * 0.1;
    samples[i] = sine + noise;  // ← Test's own synthetic data
  }
  const wavBuffer = encoder.encode(samples);
  // ... validate RecordingArbiter can parse it ...
});
```
This test **generates synthetic samples inline** to test the encoder and arbiter. It never calls `captureReceiveSideAudio()` or `recordReceiveSideCall()`. **The actual recording pipeline is not exercised.**

### Why it's a Red-Team Issue
- **Silent coverage gap:** The tests pass at 100% (line 692: `✓ Tests: 100 passed | 2 skipped`), but they don't exercise the receive-side recording code.
- **Synthetic-to-synthetic chain:** Test generates synthetic data → encoder encodes it → arbiter parses it. This proves the pipeline *can* handle synthetic data, not that it *captures* real data.
- **No page.evaluate coverage:** The real recording runs `page.evaluate(async (recId) => { ... })` to hook into the browser's RTCPeerConnection. Tests never call this.
- **Green on stubs:** The two unskipped tests in the receive-side section are "config validation" and "type signatures." Real recording acceptance is skipped (line 264–320).

---

## Finding 6: Ledger Path Not Validated in `recordReceiveSideCall()`

**File:** `e2e/harness/call-driver.ts:248–255` (integration) and `receive-side-recorder.ts:204–234` (implementation)

**Severity:** LOW — Potential silent file-write failure

### Issue
```typescript
// call-driver.ts:251
receiveSideResult = await recordReceiveSideCall(
  receiverPage,
  config.ledgerBasePath || process.cwd(),  // ← Fallback if undefined
  script,
  farEndSpeakerId,
);
```

If `config.ledgerBasePath` is undefined and `process.cwd()` is not writable (e.g., production environment, permissions denied), `fs.writeFileSync()` in `recordReceiveSideCall()` will throw and crash the whole call. No graceful fallback, no temporary directory, no check.

(This is less critical than Findings 1–4 because it would surface as an exception, not silent success. But it's worth noting.)

---

## Summary Table

| Finding | Lens | Severity | Silent? | Test Coverage |
|---------|------|----------|---------|---|
| #1: Synthetic replaces real WebM | Stub masquerade | HIGH | Yes | Test validates encoder only |
| #2: Recording failure → 0-sample WAV | False green | MEDIUM | Yes | No test exercises `captureReceiveSideAudio()` |
| #3: Speaker ID not validated | Type abuse | MEDIUM | Yes | Type system false-confidence |
| #4: Transcript from script, not capture | False green | MEDIUM | Yes | Transcript never validates audio content |
| #5: Tests skip real recording path | False green | MEDIUM | Yes | 100% pass on config + synthetic tests |
| #6: Ledger path not validated | False green | LOW | Partial | Would throw, but no error handling |

---

## Recommended Real-Call Blocker

Before shipping B08S-2 to real calls (B04-real, B08A-3), the synthetic stub (Finding 1) must be replaced with actual WebM→PCM transcoding or a real audio analysis pass. The current code will produce green metrics (valid WAV, passing tests) while recording false data.

**Commit 5d7f652 is acceptance-ready for synthetic testing but production-unsafe for real-call validation.**
