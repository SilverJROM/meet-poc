# B08S-1 Validation

**Validator:** codex55 L2  
**Verifier != fixer:** yes  
**Validated commits:** `2d9c740`, `6d0e65a`  
**Timestamp:** 2026-07-09T04:59:53Z

## Verdict: FAIL

B08S-1 does not pass the independent gate. The requested unit test target is green and the implementation stays out of WAV/transcript/AC scope, but the call driver's live join+publish proof is wired to a diagnostics object that does not exist in the app, and it does not register captured session IDs in the ledger.

## Required Checks

1. **Vitest target:** PASS  
   Command run: `npx vitest run e2e/harness/__tests__/call-driver.test.ts`  
   Result: exit 0, `1 passed`, `4 passed`, `2 skipped`.

2. **Ledger `registerCreatedID` + `incrementCallBurn` usage:** PARTIAL / FAILING CONTRACT  
   `e2e/harness/call-driver.ts` calls `registerCreatedID('room', roomId)` for created/provided rooms and calls `incrementCallBurn()` on both success and catch paths.

   Blocking gap: B08S-1 scope requires created room/session IDs. The driver reads a possible `sessionId` but never calls `registerCreatedID('session', sessionId)`, so B21 cannot rely on the ledger for run-created session cleanup.

3. **Protected IDs never deleted:** PASS  
   No B08S-1 code path deletes rooms/sessions or calls `canDelete()` for deletion. Existing ledger guard still hard-blocks `652c1475`, `TEST_ROOM01`, and `testroom01001`; the new test asserts those return `false`.

4. **No WAV/transcript scope creep:** PASS  
   `e2e/harness/call-driver.ts` does not implement receive-side WAV capture, transcript generation, recording upload, or RecordingArbiter assertions. The only WAV/transcript mentions are skipped fixture placeholders and docs explicitly deferring B08S-2.

5. **Closes no AC:** PASS  
   `validation/b08s1-changes.md` says "Closes no AC" and the code only adds harness/test exports. No AC row is marked complete by this batch.

## Blocking Findings

### F1 — Live publish validation samples the wrong debug global

`e2e/harness/call-driver.ts` reads:

- `window.__MEET_DIAGNOSTICS?.sessionId`
- `window.__MEET_DIAGNOSTICS?.getStats?.()`

The app and legacy scripts expose/use `window.__meetDebug` instead. Evidence:

- `frontend/src/app/app.component.ts:21` initializes `window.__meetDebug`
- `frontend/src/app/pages/room/room.page.ts:682` exposes `sfuPublishState`
- `frontend/src/app/pages/room/room.page.ts:692` exposes `sfuGetStats`
- `e2e/scripts/speech-guest.mjs:104` and `:122` use `window.__meetDebug` / `sfuGetStats`

Because `__MEET_DIAGNOSTICS` is not present in the app, `joinBrowser()` will return `publishedBytes = 0`, and `joinDualBrowserCall()` will fail its own publish check even if both browsers actually publish.

### F2 — Captured session IDs are not registered for cleanup

`CallResult` supports `sessionId`, and `joinBrowser()` attempts to read one, but `joinDualBrowserCall()` never registers `result1.sessionId` or `result2.sessionId` via `registerCreatedID('session', ...)`.

This violates the B08S-1 plan wording: "the ledger records the burn + created room/session IDs", and it weakens AC13/B21 cleanup safety for sessions created by the harness.

## Notes

The current test file does not catch these issues because the actual dual-browser join tests are skipped and the live diagnostics path is not unit-stubbed.

---

STATUS: REVISE — B08S-1 live diagnostics source is wrong (`__MEET_DIAGNOSTICS` vs `__meetDebug`/`sfuGetStats`) and session IDs are not registered in CallLedger.
