# B08S-2 Independent Validation R3

**Validator:** L2 codex55  
**Verifier != fixer:** yes  
**Implementation:** haiku, commits `5d7f652`, `cc07c56`, `5d16e08`  
**Head at validation:** `f2559e4`  
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`  
**Verdict:** FAIL

## Result

R3 closes the prior synthetic WAV false-green and TS1209 syntax failure, and the required Vitest target is green. I am still failing B08S-2 because the `getReceivers()` "existing tracks" fix does not cover the actual integration timing: `joinDualBrowserCall()` starts receive-side recording only after both browsers have already joined and publish validation has completed, but `captureReceiveSideAudio()` only enumerates receivers on peer connections created after it installs its wrapper.

That means an already-created call `RTCPeerConnection` with existing remote tracks is still invisible to the recorder. In a real B08S-1 -> B08S-2 run, this will most likely fail closed instead of producing the required receive-side WAV, so the evidence spine is not yet gateable.

## Checks

1. **No synthetic success WAV:** PASS.
   - `generateStubAudio()` is gone.
   - `captureReceiveSideAudio()` throws before WAV write when `samples` is null or empty.
   - Unit coverage includes null/no-capture and empty-sample failure cases.

2. **TS1209 AudioContext optional-chain constructor:** PASS.
   - The constructor is now selected first, then invoked via `new AudioContextCtor()`.
   - Focused check passed:
     - `npx tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution bundler --types node,@playwright/test --skipLibCheck e2e/harness/receive-side-recorder.ts`

3. **Existing `getReceivers()` for remote tracks:** FAIL.
   - `e2e/harness/receive-side-recorder.ts:92-109` installs a replacement `window.RTCPeerConnection` and calls `pc.getReceivers()` only inside that replacement constructor.
   - `e2e/harness/call-driver.ts:238-255` invokes `recordReceiveSideCall()` after both pages have already joined and publish validation has completed.
   - Existing call peer connections created before line 238 are never enumerated; the wrapper only affects future peer connections.
   - So the stated "capture existing tracks" fix is present textually but not effective for the current call-driver path.

4. **Vitest call-driver target:** PASS.
   - `npx vitest run e2e/harness/__tests__/call-driver.test.ts`
   - Result: `1 passed`, `13 passed | 2 skipped`.

5. **Full harness run:** PASS.
   - `npm test -w e2e -- harness/__tests__/call-driver.test.ts`
   - Result: `11 passed`, `103 passed | 2 skipped`.

6. **No AC closed / no scope creep:** PASS.
   - No diff from `5d7f652..5d16e08` touches `req-matrix.md` or `og-requirements.md`.
   - B08S-2 remains evidence-pipe scope only.

## Blocking Finding

The recorder must either install before the room creates its `RTCPeerConnection`, or it must obtain and enumerate the app's existing peer connection(s) through an existing debug surface/registry. The current code cannot discover already-created PCs from a late `window.RTCPeerConnection` replacement alone.

Until that is fixed, B08S-2 does not prove "dual-browser call yields receive-side WAV" for the actual call driver path.

## Required Fix

Move receive-side capture installation before `joinBrowser()` creates the call peer connection, or expose/register existing peer connections so `captureReceiveSideAudio()` can enumerate their `getReceivers()` at recording start. Then re-run:

```bash
npx vitest run e2e/harness/__tests__/call-driver.test.ts
npm test -w e2e -- harness/__tests__/call-driver.test.ts
```
