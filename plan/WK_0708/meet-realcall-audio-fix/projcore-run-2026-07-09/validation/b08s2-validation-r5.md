# B08S-2 Independent Validation R5

**Validator:** L2 codex55  
**Verifier != fixer:** yes  
**Implementation:** haiku, commit `14b2f96`  
**Head at validation:** `14b2f96`  
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`  
**Verdict:** FAIL

## Result

R5 fixes the R4 navigation blocker: `installCaptureHook()` now uses `page.addInitScript()` before the receiver navigates, and the focused navigation-persistence test passes. The call driver also still installs the receive hook before the receiver joins and stops after both browsers have joined and publish validation has completed.

I am still failing B08S-2 because the required Vitest gates are not green on this checkout. There is also a live recorder state bug by code inspection: the injected hook mutates closure variables after track arrival, but `stopAndEncodeCapture()` reads stale snapshot properties from `window.__captureHookState`, so real audio arrival can still fail closed instead of producing the receive-side WAV.

## Checks

1. **Navigation-persistent hook:** PASS.
   - `e2e/harness/receive-side-recorder.ts:29-115` installs the wrapper with `page.addInitScript(...)`.
   - Focused check passed:
     - `npx vitest run e2e/harness/__tests__/call-driver.test.ts -t "hook persists"`
     - Result: `1 passed | 18 skipped`.

2. **Install before receiver join:** PASS by code inspection.
   - `e2e/harness/call-driver.ts:199-212` pre-allocates the receiver page and calls `startReceiveSideRecording(...)`.
   - The receiver then joins via `joinBrowser(...)` at `e2e/harness/call-driver.ts:222` or `:234`.

3. **Stop after join/publish:** PASS by code inspection.
   - Both `joinBrowser(...)` calls complete before publish validation at `e2e/harness/call-driver.ts:253-260`.
   - `stopReceiveSideRecording(...)` runs after that at `e2e/harness/call-driver.ts:262-275`.

4. **Fail-closed, no synthetic WAV fallback:** PASS by code inspection.
   - `stopAndEncodeCapture()` throws before writing a WAV when samples are null or empty (`e2e/harness/receive-side-recorder.ts:178-183`).
   - No active synthetic WAV fallback is present in the stop path.

5. **Vitest green:** FAIL.
   - `npx vitest run e2e/harness/__tests__/call-driver.test.ts` failed:
     - `2 failed | 12 passed | 5 skipped`.
     - Failures:
       - `stopAndEncodeCapture: retrieves state from hook and encodes captured audio`
       - `startReceiveSideRecording + stopReceiveSideRecording: two-phase recording flow`
     - Both failed with `ENOENT` writing `.../e2e/harness/__tests__/.temp-call-driver-test/b08s2-receive-*.wav`.
   - `npm test -w e2e -- harness/__tests__/call-driver.test.ts` failed:
     - `1 failed | 103 passed | 5 skipped`.
     - Failure:
       - `RecordingArbiter integration: WAV file from encoder is parseable by RecordingArbiter`
     - Failed with `ENOENT` unlinking `.../e2e/harness/__tests__/.temp-call-driver-test/test-arbiter-input.wav`.
   - Root shape: B08S-2 tests use `TEMP_DIR`, but the temp directory is only created in an earlier describe's `beforeAll` and removed before later B08S-2 tests run.

6. **TypeScript:** PASS.
   - `npx tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution bundler --types node,@playwright/test --skipLibCheck e2e/harness/receive-side-recorder.ts e2e/harness/call-driver.ts` exited 0.

7. **No AC closed / no scope creep:** PASS.
   - `git diff --name-only 14b2f96^..14b2f96` is limited to:
     - `e2e/harness/__tests__/call-driver.test.ts`
     - `e2e/harness/receive-side-recorder.ts`
   - No `req-matrix.md` or `og-requirements.md` changes in the reviewed commit.

## Additional Blocking Finding

The browser hook stores these values into `window.__captureHookState` once at install time:

- `audioContext`
- `scriptProcessor`
- `recordingStartTime`
- `hasReceivedAudio`

Track handling later mutates only the closure variables (`e2e/harness/receive-side-recorder.ts:56-80`). It does not update the state object properties initialized at `e2e/harness/receive-side-recorder.ts:104-112`. `stopAndEncodeCapture()` then destructures `state.hasReceivedAudio` at `e2e/harness/receive-side-recorder.ts:143-144` and fails closed when it remains false at `:151-153`.

So after the test temp-directory issue is repaired, the live hook still needs to write updated values back to `window.__captureHookState` or make the state object own the mutable values directly.

## Required Fix

1. Recreate or isolate `TEMP_DIR` for the B08S-2 tests so both required Vitest commands are green from a clean run.
2. Update the injected hook so track arrival updates the state read by `stopAndEncodeCapture()`; do not leave `hasReceivedAudio`, `audioContext`, `scriptProcessor`, or `recordingStartTime` as install-time snapshots.
3. Re-run:
   - `npx vitest run e2e/harness/__tests__/call-driver.test.ts`
   - `npm test -w e2e -- harness/__tests__/call-driver.test.ts`
   - the navigation-persistence targeted test.
