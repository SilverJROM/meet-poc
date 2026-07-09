# Batch B03 — Proposed Implementation
## Fixed-clock conversation harness

**Proposer:** impl-haiku  
**Date:** 2026-07-09  
**STATUS:** PROPOSED

---

## Overview

B03 builds a deterministic conversation harness that schedules both bot participants on a **fixed, stable clock** independent of LLM latency. The harness proves that:

1. Pre-generated speech audio assets play at their intended time slots
2. Transcript/analysis confirms expected utterances are audible even when LLM brain replies are delayed
3. Speech never silences or stutters while waiting for LLM replies
4. The infrastructure supports later `.140` <-> `.123` loop integration (B04+)

---

## Architecture

### 1. **Fixed-Clock Speech Scheduler** (`e2e/harness/conversation-scheduler.ts` — NEW)

A deterministic event scheduler that manages two-bot timing independent of async LLM.

**Responsibilities:**
- Define conversation turns as fixed-time utterances (time in ms from conversation start, duration, speaker, text)
- Pre-define both bot's utterance sequences before starting the harness
- Trigger playback of pre-generated audio assets at exact wall-clock moments
- Never wait for LLM responses to advance the speech timeline
- Log all scheduled events with actual playback times for later correlation with recordings

**Interface:**
```typescript
export interface UtteranceSlot {
  speaker: 'bot-140' | 'bot-123';
  timeMs: number;              // Absolute ms from conversation start
  durationMs: number;          // Expected audio duration
  audioPath: string;           // Path to pre-generated WAV file
  text: string;               // Transcribed content for later verification
}

export interface ConversationScript {
  utterances: UtteranceSlot[];
  totalDurationMs: number;
  llmBrainKey: 'bot-140' | 'bot-123'; // Which bot's LLM runs async (the other is pure scheduler replay)
}

export class ConversationScheduler {
  schedule(script: ConversationScript): Promise<void>;
  getPlayedUtterances(): PlayedUtterance[];
  getTimingReport(): TimingReport;
}

export interface PlayedUtterance {
  speaker: 'bot-140' | 'bot-123';
  scheduledTimeMs: number;
  actualPlaybackTimeMs: number;
  audioPath: string;
  text: string;
  skewMs: number; // |actual - scheduled|
}
```

### 2. **Pre-Generated Audio Assets** (new directory `e2e/fixtures/bot-speech/` — NEW)

Store fixed, pre-recorded utterances for both bots.

**File structure:**
```
e2e/fixtures/bot-speech/
├── bot-140/
│   ├── hello.wav
│   ├── how-are-you.wav
│   ├── thank-you.wav
│   └── manifest.json    # {text, durationMs, path} mapping
├── bot-123/
│   ├── hello.wav
│   ├── im-fine.wav
│   ├── goodbye.wav
│   └── manifest.json
└── README.md  # How to regenerate from piper or source
```

**Generation strategy:**
- If piper is available: pre-run `piper` with fixed seed on canonical utterances → check into git
- If piper unavailable: use synthetic WAV placeholders (white noise + metadata) with matching durations and loudness profiles
- Each asset includes loudness metadata (RMS/LUFS) for later B05+ stimulus verification
- All assets validated to confirm they decode, have expected duration, and known loudness

### 3. **Async LLM Brain Path** (new shim in `e2e/harness/async-brain.ts` — NEW)

Runs the LLM reply logic in a fire-and-forget manner so it never blocks the speech scheduler.

**Responsibilities:**
- Accept the previous turn's user utterance + transcript so far
- Dispatch an async LLM query (ollama, claude, or mock for this phase)
- Store the response in a buffer without waiting
- Return immediately (don't block scheduler)
- Later batches (capture-path B05/B07) will inject the LLM response into the WebRTC stream

**Interface:**
```typescript
export interface AsyncBrainState {
  lastUserUtterance?: string;
  transcriptSoFar: string;
  pendingReply?: {promise: Promise<string>; settled: boolean};
  settledReply?: string;
}

export class AsyncBrain {
  dispatch(userText: string, transcriptSoFar: string): Promise<void>;
  getSettledReply(): string | undefined;
  getState(): AsyncBrainState;
  reset(): void;
}
```

### 4. **Local Harness Test Fixture** (`e2e/harness/__tests__/conversation-scheduler.test.ts` — NEW)

Validates that the scheduler alone (without real WebRTC) can play both bots' utterances in a predictable sequence.

**Test flow:**
1. Load a simple 5-utterance script: bot-140 hello → bot-123 reply → bot-140 follow-up → bot-123 thanks → bot-140 goodbye
2. Mock the audio playback (no real devices; just file I/O + time tracking)
3. Run scheduler for ~10s of wall-clock time
4. Verify:
   - All utterances played in correct order
   - Timing skew is <50ms (TBD tuning constant)
   - PlayedUtterance log matches expected sequence
   - No dropped or reordered turns

**Dependencies:**
- B02's `RecordingArbiter` to analyze the output recording (if we record the mock playback to WAV)
- Mock file I/O for test portability (no system audio device needed)

### 5. **Integration Entry Point** (`e2e/harness/index.ts` — UPDATED)

Export the scheduler and async-brain for use in later batches (B04+).

```typescript
export { ConversationScheduler, type ConversationScript } from './conversation-scheduler';
export { AsyncBrain, type AsyncBrainState } from './async-brain';
export { LoudnessAnalyzer, RecordingArbiter, type RecordingAnalysis } from './recording-arbiter';
export { CallLedger } from './call-ledger';
```

---

## Implementation Scope

| File | Change | Lines | Rationale |
|------|--------|-------|-----------|
| `e2e/harness/conversation-scheduler.ts` | NEW | ~200 | Core scheduler: deterministic event loop, timestamp tracking |
| `e2e/harness/async-brain.ts` | NEW | ~80 | Fire-and-forget LLM dispatch; no blocking |
| `e2e/harness/__tests__/conversation-scheduler.test.ts` | NEW | ~150 | Unit test: scheduler alone without WebRTC/recording |
| `e2e/harness/index.ts` | UPDATED | +3 | Export scheduler + async-brain for harness consumers |
| `e2e/fixtures/bot-speech/bot-140/manifest.json` | NEW | ~10 | Audio asset registry for bot-140 |
| `e2e/fixtures/bot-speech/bot-123/manifest.json` | NEW | ~10 | Audio asset registry for bot-123 |
| `e2e/fixtures/bot-speech/README.md` | NEW | ~30 | Piper regeneration instructions |

**Total new lines:** ~480  
**Estimated effort:** 25 minutes (within B03 budget)

---

## Acceptance Criteria (from B03 plan row)

**AC:** "Local harness run records both sides speaking fixed utterances; transcript proves expected words were emitted even if async brain response is late. Supports AC8/AC9."

**Specific proof:**
1. **Timing integrity:** `ConversationScheduler.getTimingReport()` shows all utterances played ±50ms of schedule
2. **Transcription match:** If B02's `RecordingArbiter` is run on a recording of the harness output, the `transcript` field contains all expected utterances in order
3. **Async latency resilience:** Even if `AsyncBrain.dispatch()` takes 5+ seconds to resolve, the next scheduled utterance plays on time (the promise is never awaited in the speech path)
4. **Vitest PASS:** All 3 test files pass locally without errors

---

## Test Strategy

| Test | File | Focus | Gate |
|------|------|-------|------|
| **Unit: Scheduler alone** | `conversation-scheduler.test.ts` | Timing, order, no drops | Vitest PASS (15/15) |
| **Unit: AsyncBrain dispatch** | (inline in async-brain.ts) | Fire-and-forget semantics | Vitest PASS (5/5) |
| **Integration: Mock playback** | `conversation-scheduler.test.ts` (extended) | Simulate playback + timing variance | Vitest PASS + skew report |

**Recording analysis:** B04 will record real `.140` <-> `.123` calls and analyze with B02's arbiter; B03 harness is proof-of-concept for the scheduler.

---

## Non-Negotiables (from B03 brief)

✅ **Fixed-clock speech scheduler** — deterministic, not gated by LLM  
✅ **Pre-generated audio assets** — piper or synthetic WAVs, all checked in  
✅ **Async brain never blocks** — LLM promises not awaited in playback path  
✅ **Hooks for .140/.123 loop** — scheduler returns timing report for B04+  
✅ **Reuse e2e/harness/** — all code in harness/, fixtures in e2e/fixtures/  
✅ **B02 arbiter available** — `RecordingArbiter` used for optional recording analysis

---

## Handshake

- **First STATUS:** PROPOSED ✓
- **Next:** Wait for APPROVED-PLAN
- **Then:** Implement → vitest → commit → [projcore callback] STATUS: DONE
- **Callback format:** `b03-changes.md` with test results + timing report from mock harness run

---

## Risk Mitigations

| Risk | Mitigation |
|------|-----------|
| Piper not available in env | Use synthetic WAV placeholders with matching duration/loudness; mark as mock in manifest |
| Audio playback timing variance | Accept ±50ms as acceptable; log all skews for B04+ diagnostics |
| LLM dispatch fails | Async brain catches errors, returns last settled reply or empty string; never crashes scheduler |
| Test flakiness from wall-clock timing | Use Node.js timers (not `Date.now()`); inject fake clock for deterministic testing if needed |

---

## Success Criteria

- [ ] `conversation-scheduler.ts` exports `ConversationScheduler` class
- [ ] `async-brain.ts` exports `AsyncBrain` class with fire-and-forget dispatch
- [ ] Both bot-speech manifests created with ≥3 utterances each
- [ ] Vitest tests all pass locally (15+ assertions)
- [ ] Mock harness run produces timing report with <50ms skew
- [ ] `b03-changes.md` documents test results + ready-to-integrate checklist for B04

---

## Later Integration (B04+)

- B04 will use `ConversationScheduler` to run real `.140` <-> `.123` calls with fixed utterance sequences
- B04 will record both sides and run B02's `RecordingArbiter` to verify transcript
- B05+ capture-path may replace bot-speech with instrumented getUserMedia shims
- This batch provides **dumb, deterministic scaffolding** for the real-call loop
