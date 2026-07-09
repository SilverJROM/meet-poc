# B08S-2 Independent Validation R4

**Validator:** L2 codex55  
**Verifier != fixer:** yes  
**Implementation:** haiku, commit `32a1951`  
**Head at validation:** `32a1951`  
**Run dir:** `/home/agjrom/websites/meet-poc/plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09`  
**Verdict:** FAIL

## Result

R4 moves `startReceiveSideRecording()` textually before the receiver's `joinBrowser()` call, and it keeps `stopReceiveSideRecording()` after both joins and publish validation. That addresses the R3 ordering shape in `call-driver.ts`.

However, the hook is installed with `page.evaluate()` on a newly-created blank receiver page before `joinBrowser()` runs. `joinBrowser()` immediately calls `page.goto(roomUrl)`, which creates a new document and discards the modified `window.RTCPeerConnection` and `window.__captureHookState`. Therefore the wrapper is not present when the app page creates its real call `RTCPeerConnection`, and `stopAndEncodeCapture()` will fail closed due to missing hook state rather than producing the required receive-side WAV.

This still does not satisfy B08S-2's evidence spine.

## Checks

1. **Install hook / start recording before receiver join:** FAIL.
   - `e2e/harness/call-driver.ts:199-212` creates the receiver page and calls `startReceiveSideRecording(...)` before `joinBrowser(...)`.
   - But `e2e/harness/call-driver.ts:222` / `:234` then calls `joinBrowser(...)`, and `joinBrowser()` starts with `page.goto(roomUrl)` at `e2e/harness/call-driver.ts:72`.
   - Because `installCaptureHook()` uses `page.evaluate()` (`e2e/harness/receive-side-recorder.ts:29-114`) rather than `page.addInitScript()`, the hook is scoped to the pre-navigation document and is lost on navigation.

2. **Stop / encode after join:** PASS.
   - `e2e/harness/call-driver.ts:253-275` validates publish bytes after both joins, then calls `stopReceiveSideRecording(...)`.
   - `stopReceiveSideRecording()` calls `stopAndEncodeCapture(...)` at `e2e/harness/receive-side-recorder.ts:291-295`.

3. **Fail-closed, no synthetic WAV fallback:** PASS by code inspection.
   - No `generateStubAudio` or stub-sample fallback remains in the active recorder.
   - `stopAndEncodeCapture()` throws before writing a WAV when hook state is missing, inactive, null, or empty (`e2e/harness/receive-side-recorder.ts:136-183`).
   - Note: the explicit no-capture tests in `call-driver.test.ts:488-593` are now skipped as deprecated API tests, so the active test suite does not directly enforce this fail-closed path.

4. **Navigation persistence probe:** FAIL for the R4 mechanism.
   - Independent Playwright probe installed a `window.__captureHookState` and wrapped `window.RTCPeerConnection` via `page.evaluate()` on a blank page, then navigated the page.
   - Output:
     ```json
     {
       "before": { "hasState": true, "wrapped": true },
       "after": { "hasState": false, "wrapped": false }
     }
     ```
   - This matches the R4 call-driver flow: install on new blank page, then navigate in `joinBrowser()`.

5. **Vitest / TypeScript:** PASS.
   - `npx vitest run e2e/harness/__tests__/call-driver.test.ts` -> 1 file passed; `13 passed | 5 skipped`.
   - `npm test -w e2e -- harness/__tests__/call-driver.test.ts` -> 11 files passed; `103 passed | 5 skipped`.
   - `npx tsc --noEmit --pretty false --target ES2022 --module ESNext --moduleResolution bundler --types node,@playwright/test --skipLibCheck e2e/harness/receive-side-recorder.ts e2e/harness/call-driver.ts` -> exit 0.

6. **No AC closed / no scope creep:** PASS.
   - `git diff --name-only 32a1951^..32a1951` is limited to:
     - `e2e/harness/__tests__/call-driver.test.ts`
     - `e2e/harness/call-driver.ts`
     - `e2e/harness/receive-side-recorder.ts`
   - No `req-matrix.md` or `og-requirements.md` changes in the reviewed commit.

## Blocking Finding

`installCaptureHook()` must be installed into the room document before app code constructs `RTCPeerConnection`. Installing via `page.evaluate()` before `page.goto()` does not persist into the navigated page, so the current R4 implementation still cannot capture the receiver page's real call peer connection.

## Required Fix

Use a navigation-persistent hook installation, e.g. `page.addInitScript(...)` before `joinBrowser()` navigates, or split `joinBrowser()` so the receiver page navigates first, installs the hook in the room document before join/media setup creates the peer connection, and only then clicks join. Keep `stopAndEncodeCapture()` after both joins/publish validation and retain fail-closed behavior.
