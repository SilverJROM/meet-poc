# B08S-2 Independent Validation — Interim (L2 sonnet)

**Validator:** L2 sonnet (interim gate; codex55 reserved for FINAL per routing lock)
**Verifier != fixer:** yes — no product/harness edits made; one throwaway probe test created and deleted, tree left clean
**Implementation:** haiku, design-locked rewrite
**Commits under test:** `0b589a4` (design-locked rewrite) + `dae01fc` (test fixes)
**Design truth:** `decisions/2026-07-09-b08s2-receive-capture-hook-design.md` (A-primary, THREE GUARDS)
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`
**Verdict:** **FAIL**

## Summary

The design (A-primary addInitScript shim, fail-closed taxonomy, no synthetic WAV) is
correctly *structured* in `receive-side-recorder.ts`, and the required vitest gates are
green (27/27). But every one of those tests mocks `page.evaluate()` — none of them
actually execute the injected in-page hook script against a live `MediaStreamTrack` in a
real browser. I built a throwaway Playwright probe that does (loopback `RTCPeerConnection`
pair + real fake-device audio track, hook installed via the real `installCaptureHook()`,
same code path `call-driver.ts` uses) and found the in-page capture pipeline is broken in
two independent, compounding ways. **Every real call, including one with real audible
speech, will presently be misclassified as SILENCE — never VALID.** This is the exact
false-green-adjacent trap ("manufactured captured-silence from a broken graph") the design
doc explicitly names as the thing this batch exists to kill, just inverted: instead of
manufacturing a fake PASS, it manufactures a fake FAIL-that-looks-like-real-evidence
(SILENCE, not INVALID) for every live call, because the harness never surfaces the two
runtime errors below to `classifyCapture()` — they are swallowed inside the audio
callback.

## Checks

### 1. vitest call-driver + receive-side-recorder — PASS (green, but see gap below)

```
npx vitest run e2e/harness/__tests__/receive-side-recorder.test.ts e2e/harness/__tests__/call-driver.test.ts
✓ receive-side-recorder.test.ts (13 tests)
✓ call-driver.test.ts (19 tests | 5 skipped)
Tests  27 passed | 5 skipped (32)
```
Matches the commit's claim. **Gap:** every `call-driver.test.ts` case that exercises
`stopAndEncodeCapture` / `installCaptureHook` mocks `page.evaluate()` and hands back a
pre-built state object — none of them run the actual `addInitScript` hook body in a
browser. The design's Minimal Implementation Contract lists four required browser tests
(#6 `ontrack` coexistence, #7 existing-at-join + renegotiation, #8 captured silence via a
real zero-gain oscillator, #9 no-capture) beyond #4 (nav persistence, present). None of
#6–#9 were added in this batch. That gap is exactly why the two defects below shipped
green.

### 2. RTCConfiguration passthrough (GUARD 1) — PASS

`receive-side-recorder.ts:240-254`: the shim constructor spreads `...args` straight into
`new originalRtcPeerConnection(...args)` with no filtering or mutation, then returns the
real `pc`. No config field is touched.

### 3. No synthetic success WAV; no-capture fail-closed — PASS (logic present)

`generateStubAudio()` is confirmed removed (`grep` clean). `stopAndEncodeCapture()`
throws a distinct `INVALID_*` / `PRODUCT_NO_MEDIA` error and never writes a WAV for any
non-VALID/SILENCE classification (`receive-side-recorder.ts:307-327`). This part of the
design is honored — but see Finding 1: it never gets the chance to matter, because real
captures always land in SILENCE instead of VALID regardless of actual signal.

### 4. AudioContext running guard (GUARD 3) — PASS with a non-blocking race

`receive-side-recorder.ts:191-198` calls `audioContext.resume()` fire-and-forget
(`.catch(() => {})`, not awaited) then immediately checks `audioContext.state !==
'running'` synchronously. In practice this is masked by
`--autoplay-policy=no-user-gesture-required` in `call-driver.ts` (`AudioContext` starts
`running`, not `suspended`, under that flag — confirmed in my probe:
`audioContextState: "running"`). Non-blocking for this gate; flag as a latent risk if the
launch flag is ever dropped.

### 5. Tee wiring does NOT preserve capture — **FAIL, blocking (Finding 1 + 2)**

Empirical probe (throwaway `vitest` browser test, deleted after use): installed the real
`installCaptureHook()` on a page, then in-page built a genuine loopback `RTCPeerConnection`
pair (pc1 sends a real fake-device audio track from `bot-140/hello.wav`, pc2 is the
wrapped receiver — same mechanism class as `b08a2-sender-liveness.browser.test.ts`), let
audio flow for 2.5s, then read `window.__b08s2ReceiveCapture`:

```
B08S2_TEE_PROBE_RESULT {"installed":true,"pcCount":2,"trackCount":1,"callbackCount":27,
  "sampleCount":110592,"audioContextState":"running","sampleLen":0,"firstBytesAllZero":true}
B08S2_TEE_PROBE_PAGE_ERRORS ["Buffer is not defined", ... x27]
```

Two independent, compounding defects, both in `receive-side-recorder.ts`'s injected
in-page hook body:

**Finding 1 (root cause, blocking): `Buffer` is used inside browser-injected code.**
`onaudioprocess` (`:209-221`) does `Buffer.from(int16).toString('base64')`. `Buffer` is a
Node.js global — it does not exist on `window` in a real browser page. This throws
`Buffer is not defined` on **every single** `onaudioprocess` invocation (27/27 in the
probe, matching `callbackCount`), *after* `state.callbackCount++` and
`state.sampleCount += inputData.length` already ran but *before*
`state.audioSamplesBase64 += base64Chunk`. Net effect: `callbackCount` and `sampleCount`
look healthy (real, nonzero), but `audioSamplesBase64` stays permanently `''` for the
entire capture — confirmed (`sampleLen: 0`). `calculateRms('')` returns `0` early
(`:86`), so `classifyCapture()` unconditionally lands on `SILENCE` (`rms < 0.01`) for
every real call, real speech or not. This is silent in the sense that no test in
`call-driver.test.ts`/`receive-side-recorder.test.ts` would ever observe it, because
those tests only exercise `classifyCapture()` and `stopAndEncodeCapture()` against
hand-built state objects — never the actual page-injected function that produces
`audioSamplesBase64` in the first place.

**Finding 2 (independent, also blocking): the tee never routes source audio into the
`ScriptProcessorNode`'s input.** In `processAudioTrack` (`:177-237`), the
`ScriptProcessorNode`/mixer graph built on the first track (`:191-226`) keeps its
`mixerGain`/`zeroGain` as function-local `const`s — never stored on `state`. The
"GUARD 2 (tee)" code that runs for every track (`:229-236`) then does:
```js
const mixerGain = state.scriptProcessor.destination || state.scriptProcessor.context.createGain();
source.connect(mixerGain);
```
`ScriptProcessorNode` (and `AudioNode` generally) has no `.destination` property — only
`AudioContext` does — so `state.scriptProcessor.destination` is always `undefined`, and
every track's `source` gets connected to a **freshly created, otherwise-unconnected
`GainNode`** that goes nowhere. The real `scriptProcessor` never receives the
`MediaStreamAudioSourceNode` as input at all. Even with Finding 1 fixed, `onaudioprocess`
would still read all-zero `inputBuffer` samples from a genuinely silent (disconnected)
input — this is precisely "the trap this contract closes" the design doc warns against
(§ "The trap this contract closes": a `ScriptProcessorNode` with no source connected
"emits all-zero buffers... manufacture[s] 'captured silence' out of no-capture"), just
reached by a wiring bug instead of an eager-graph bug.

Both defects must be fixed together: (a) replace `Buffer`/`Buffer.from` with a
browser-safe Int16→base64 path (`btoa` over a `Uint8Array`/binary string, or equivalent),
and (b) actually `source.connect(state.scriptProcessor)` (the real processor, stored on
`state`) instead of connecting into a disposable dead-end `GainNode`.

### 6. LATE INSTALL not reintroduced — PASS

`installCaptureHook()` uses `page.addInitScript()` (not `page.evaluate()`), with an
`about:blank` ordering guard (`:110-117`) and no `pc.getReceivers()` dead code (grep
clean). The R2–R6 failure class is not reintroduced.

## Independence note

Same provider (Anthropic) as the reserved L3/FINAL codex55-class check would be if
codex55 were still available this round — **cross-provider independence is not claimed
here**; this is a same-provider, different-model (sonnet-on-haiku) interim gate per the
run's routing lock (codex55 conserved for FINAL only). Model independence from the haiku
implementer holds. Verdict is based on direct re-execution and a new empirical probe
against real Chromium, not log-reading.

## Cleanup

Throwaway probe test file created at
`e2e/harness/__tests__/zzz-b08s2-tee-probe.browser.test.ts`, deleted after use.
`git status --short e2e/` clean. No room joined, no SFU contacted, no ledger IDs
registered, 0/25 call burn (loopback-only, same class as B05/B07/B08A-2 probes).

## Required fix (send-back)

1. Browser-safe base64 encode in `onaudioprocess` (no `Buffer` on `window`).
2. Fix the tee: connect the per-track `MediaStreamAudioSourceNode` into the actual
   `state.scriptProcessor` input, not a disposable local `GainNode`.
3. Add at least one real-browser test (loopback PC + real fake-device audio track,
   pattern in this report / `b08a2-sender-liveness.browser.test.ts`) asserting
   **non-zero, non-silent RMS** out of `classifyCapture()` for a genuinely non-silent
   remote track — the current suite has no test that would have caught this, and without
   one a future refactor can silently reintroduce the same class of bug.
4. Re-run the four gates in the design doc plus the new real-audio browser test.
