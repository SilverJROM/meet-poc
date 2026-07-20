# B00S-AC15-RESCOPE Implementation Brief — Real-Device Re-Demo

**Your first tool call in every reply MUST be the `callbacks.md` append … BEFORE any prose tokens stream.**

---

## Summary

Prove AC15 (sender-liveness invariant) on **real-virtual-mic** device mode with speech stimulus. Currently AC15 is SCOPED (fake-device + file-speech only). This batch re-demos the same AC15 test on real-virtual-mic to promote to full VERIFIED.

## Context

**Prior AC15 state (B08A-3 r2, 3150f08):**
- ✅ Live clause VERIFIED: both speakers advancing + receive-side capture VALID
- ✅ Discrimination VERIFIED (B08A-2): distinguishes sender-dead from both-advancing
- ✅ Proof: fake-device + alice-host.wav (real speech) + local whisper + four counters
- ❌ **NOT** full VERIFIED: only fake-device tested; real-virtual-mic + APM/AGC untested

**This batch:** Re-run the same AC15 live-clause test on real-virtual-mic (not fake-device).

## Task

1. **Create B00S-AC15-RESCOPE real-device test variant:**
   - Copy/adapt b08a3-sender-liveness.browser.test.ts (existing AC15 live test)
   - Change device_mode from 'fake-device' to 'real-virtual-mic'
   - Keep stimulus='speech' (alice-host.wav or piper fixture)
   - Keep assertions: classifySenderLiveness===both-advancing, all four counters strictly advance, receive WAV VALID rms>0
   - 1 call burn (same cost as B08A-3 run)

2. **Verify real-virtual-mic works end-to-end:**
   - CallDriver accepts device_mode: 'real-virtual-mic' (added in B00S-DEVICE)
   - Both browsers connect and record successfully
   - Receive-side capture produces non-zero RMS (not SILENCE)
   - All four counters (pcCount, trackCount, callbackCount, sampleCount) strictly advance

3. **Test expectations:**
   - Target: 1 real dual-browser call (no flakes, real audio)
   - ✅ PASS: classifySenderLiveness === both-advancing + four counters advance + receive WAV VALID rms>0
   - ❌ FAIL: SILENCE, counters stuck, any part fails
   - No scope expansion: this is a re-demo, not a new AC or feature

4. **Acceptance:**
   - Test passes (1 call successful, no regressions from B08A-3)
   - No product code changes (test-only)
   - Evidence logged to validation/ (call timestamp, WAV, transcript)

## Notes

- **Device mode note:** real-virtual-mic requires .123 reachable with PipeWire (confirmed in B00S-DEVICE)
- **Speech stimulus:** use alice-host.wav (22050Hz, real speech, ~26 words) or piper fixture
- **Burn accounting:** 1 call burn logged (already within budget)
- **No product changes:** test harness only; B00S-AC15-RESCOPE is a validation batch, not a feature add

## Files to touch

- `e2e/harness/__tests__/b00s-ac15-rescope.browser.test.ts` (new, ~80-100 lines; copy from b08a3 + adapt device_mode)
- `e2e/harness/__tests__/call-driver.test.ts` (existing, no changes expected)
- Test evidence to validation/ (call metadata, WAV, transcript)

## Gating

- `npx vitest run e2e/harness/__tests__/b00s-ac15-rescope.browser.test.ts` → must pass (1 test)
- Memory: watch for ~3.5GB per run; maxForks: 3 is locked (do NOT override)
- No full-e2e suite runs; this is isolated to the new test file

## Verdict format

STATUS: DONE — PASS (commit hash, "AC15 re-demo real-virtual-mic PASS; classifySenderLiveness both-advancing; 4 counters advance; receive WAV VALID") or STATUS: DONE — FAIL (which assertion failed, reproduction steps).

---

**Scope:** tiny re-demo. Estimate: 25 min. No product code. Validation/fix loop only if test flakes.
