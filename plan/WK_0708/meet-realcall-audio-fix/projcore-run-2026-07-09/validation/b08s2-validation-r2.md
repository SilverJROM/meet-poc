# B08S-2 Independent Validation R2

**Validator:** L2 codex55  
**Verifier != fixer:** yes  
**Implementation:** haiku, commit `cc07c56`  
**Base:** `5d7f652`  
**Verdict:** FAIL

## Result

The specific prior false-green is fixed: `captureReceiveSideAudio()` no longer writes the generated 440 Hz stub WAV when the page returns no captured remote audio. No-capture now throws before writing a WAV, and unit coverage was added for null/empty capture.

I am still failing R2 because the new live capture branch contains invalid TypeScript syntax at `AudioContext` construction. The required Vitest target is green, but it does not execute or type-check that browser branch, so it does not prove the recorder is acceptable live harness code.

## Checks

1. **No synthetic WAV as success path for live evidence:** PASS for active path.
   - `captureReceiveSideAudio()` checks `captureResult.samples === null || captureResult.samples.length === 0` before encoding.
   - The old unconditional `generateStubAudio(duration)` success path is gone.
   - Residual cleanup: `generateStubAudio()` remains as dead private code in `receive-side-recorder.ts`, but `rg` shows no callers.

2. **No-capture throws/returns invalid, no voiced stub file as success:** PASS.
   - Null samples throw `captureReceiveSideAudio: No real remote audio captured ... Failing closed instead of writing synthetic WAV.`
   - Empty sample arrays also throw.
   - The added test asserts no WAV is written for the null no-capture case.

3. **Unit tests cover no-capture failure:** PASS.
   - Added tests:
     - `captureReceiveSideAudio: fails closed when no real audio captured (rejects synthetic)`
     - `captureReceiveSideAudio: empty sample array also fails closed`
   - Positive sample encoding coverage also exists.

4. **Required Vitest target:** PASS.
   - Ran: `npx vitest run e2e/harness/__tests__/call-driver.test.ts`
   - Result: `1 passed`, `13 passed | 2 skipped`.

5. **CallResult paths still OK when real capture succeeds:** PARTIAL.
   - By inspection, `joinDualBrowserCall()` still propagates `receiveSideResult?.wavPath`, `transcriptPath`, and `transcriptContent` onto `CallResult`.
   - `captureReceiveSideAudio()` positive unit coverage proves a non-empty sample array produces a WAV path.
   - Blocker: the actual browser capture branch includes invalid TypeScript:

```ts
audioContext = new (window as any).AudioContext?.() ||
  new (window as any).webkitAudioContext?.();
```

   - Independent check:
     - Ran: `npx tsc --noEmit --pretty false --allowJs false e2e/harness/receive-side-recorder.ts e2e/harness/__tests__/call-driver.test.ts e2e/harness/call-driver.ts`
     - Result: `TS1209: Invalid optional chain from new expression` on both `AudioContext` lines.
   - This is not caught by the requested Vitest target because its mocks bypass `page.evaluate()`'s function body.

6. **Closes no AC:** PASS.
   - No `req-matrix.md` or `og-requirements.md` change in `5d7f652..cc07c56`.
   - B08S-2 remains evidence-pipe scope only.

## Blocking Finding

`e2e/harness/receive-side-recorder.ts:64-66` is invalid TypeScript. Replace the optional-chain constructor pattern with explicit constructor selection before `new`, for example:

```ts
const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
if (!AudioContextCtor) return;
audioContext = new AudioContextCtor();
```

## Residual Risk

The recorder still installs the `RTCPeerConnection` wrapper when `recordReceiveSideCall()` is called. In `joinDualBrowserCall()`, that happens after both browsers have already joined and publish validation has run. If remote audio tracks arrived before the wrapper is installed, live capture may fail closed rather than capture an existing connection. This is safer than the prior synthetic false-green, but it should be fixed before relying on B08S-2 for live AC evidence.

## Required Fix

Fix the invalid `AudioContext` constructor code, then re-run:

```bash
npx vitest run e2e/harness/__tests__/call-driver.test.ts
npx tsc --noEmit --pretty false --allowJs false e2e/harness/receive-side-recorder.ts e2e/harness/__tests__/call-driver.test.ts e2e/harness/call-driver.ts
```

If R3 is intended to prove real live capture, start capture before remote track arrival or explicitly enumerate/capture existing remote audio tracks.
