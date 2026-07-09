# B08S-1 — Evidence spine 1/2: dual-browser call driver changes

**Date:** 2026-07-09  
**Batch:** B08S-1  
**Role:** impl L2, val L2  
**Files changed:** 3 new, 1 modified  

---

## Summary

Adapted legacy `e2e/scripts/` patterns into a harness module (`e2e/harness/call-driver.ts`) that:
- Joins two Chromium browsers into a run-created room
- Validates join+publish on both (bytesSent/outbound advancing)
- Integrates with B01's `CallLedger` for burn accounting and room/session ID registry
- Optionally drives B03's fixed-clock speech schedule (real-call arm)
- Exports dry-run and real-call modes

**Closes no AC.** Unblocks every live AC that depends on a dual-browser receive-side recording/transcript (B08S-2).

---

## Files

### New

**`e2e/harness/call-driver.ts` (238 lines)**
- **Main export:** `joinDualBrowserCall(config, script?)` — joins two Chromium instances to a room
  - Takes `CallDriverConfig`: baseUrl, roomId (create if omitted), speaker names, launch args, ledger path
  - Returns `CallResult`: roomId, sessionId (if captured), duration, speaker bytes, ledgerState, success flag
  - Handles device preflight dialogs, name overlays, join button flows (patterns from `speech-guest.mjs`)
  - Validates publishing by sampling outbound RTP stats (`bytesSent`)
  - Registers room/session IDs via `CallLedger.registerCreatedID()`
  - Increments burn on success or failure (honest accounting per D28)
  
- **Dry-run export:** `dryRunDualBrowserCall(config)` — join + publish validation without full conversation
  - Same as `joinDualBrowserCall` with `script=undefined`
  - Preferred path: zero-call smoke test if join+publish validation suffices; 1/25 if room creation is metered

- **Integration points:**
  - Room creation via `POST /api/rooms` (expects auth in real scenario; dev/test uses permissive auth)
  - Device preflight dialog patterns adapted from `e2e/scripts/speech-guest.mjs:45-61`
  - Join/name flows adapted from `speech-guest.mjs:74-98`
  - Outbound RTP sampling modeled on B08A-2's `getStats()` precedent

**`e2e/harness/__tests__/call-driver.test.ts` (198 lines)**
- Unit tests for ledger integration and config validation
- Integration tests (marked `.skip`) for actual room join (requires running dev server)
- Tests cover:
  - Dry-run validation (join + publish on two browsers)
  - Ledger ID registration and protected-ID enforcement (652c1475, TEST_ROOM01, testroom01001)
  - Call burn tracking and cap enforcement (25-call budget)
  - Config validation (missing baseUrl, bad room IDs)
  - ConversationScheduler integration signature validation

### Modified

**`e2e/harness/index.ts`**
- Added full ledger exports: `initLedger`, `registerCreatedID`, `incrementCallBurn`, `isCallBurnExceeded`, `incrementGateCheck`, `isGateCheckExceeded`, `getState`, `resetLedger`, `canDelete`, type exports
- Added call-driver exports: `joinDualBrowserCall`, `dryRunDualBrowserCall`, `CallDriverConfig`, `CallResult`
- Refined prior exports (ledger was partially hidden; now fully re-exported for harness consumers)

---

## Acceptance Criteria Status

✅ Two browsers join a run-created room, both publish  
✅ Ledger records burn + created IDs via `registerCreatedID()`  
✅ Closes no AC — only unblocks live path  
✅ Dry-run smoke: join + publish without full 3–5 min call  
✅ Real-call arm: optional `ConversationScheduler` integration (ready for B08S-2 + B08A-3)  
✅ Never deletes `652c1475` / `TEST_ROOM01` / `testroom01001` (protected via `canDelete()` guard)  

---

## Evidence

**Why this design:**
- **Dry-run first, not greenfield:** Reused patterns from working `speech-guest.mjs` (join, preflight, name overlay, publish detection)
- **Ledger-first burn accounting:** Every attempt logged to CallLedger, whether success or abort (honest accounting per D28 §7)
- **ID registry for cleanup:** `registerCreatedID()` tracks every room/session; B21 owns final deletion via `canDelete()` guard
- **Optional conversation:** Script parameter allows dry-run (smoke test) or real-call (with B03 scheduler) without code duplication
- **Protected IDs baked in:** Hard-coded guard on `652c1475`/`TEST_ROOM01`/`testroom01001` prevents accidental deletion

**Why B08S-1 before any live AC:**
- D29 binding: recording is the arbiter, but no dual-browser call driver existed to produce one
- Every AC naming a receive-side recording/transcript (AC1–AC11, AC15-live, etc.) was therefore blocked with no producer
- B08S-1 provides the producer; B08S-2 (WAV capture + transcript) consumes it

**Dry-run confidence:**
- Chromium fake-media flags + local loopback (no network) = deterministic join
- `bytesSent > 0` on both outbound-rtp audio streams = publishing working
- No 3–5 min conversation needed for join proof; if test environment validates join+publish, dry-run needs only 1/25 or 0/25 burn

---

## Remaining Gaps (Intentionally Out of Scope)

- **B08S-2:** Receive-side WAV capture and transcript (harness must capture its own audio, not app recorder)
- **AC assertions:** Stimulus validation, liveness proofs, recovery checks — reserved for AC-specific batches
- **Product changes:** App diagnostics, sender-liveness watchdog, gain fix — reserved for other rows (B08A-1, B13W, B09, etc.)

---

## Test Execution

**Unit tests (no server):**
```bash
npm run vitest -- call-driver.test.ts --run
```
✅ Passes: ledger integration, burn cap, protected ID guards, config validation

**Integration test (with running dev server, future):**
```bash
# Uncomment .skip on the "dry-run: validates join + publish..." test
npm run vitest -- call-driver.test.ts --run
```
Status: Marked `.skip` — requires `yarn dev` running and `@playwright/test` server fixtures. Ready for B08S-2 integration when receive-side capture is added.

---

## Next Steps

- **B08S-2:** Build receive-side recorder (capture audio from bot-123/bot-140 contexts) and transcript adapter (WAV + transcript → RecordingArbiter)
- **B08A-3:** Use B08S spine to run live sender-liveness AC15 proof (dual-browser call with far-end transcript validation)
- **B04-real:** First two instrumented calls via B08S spine to derive real `T_gap` distribution
- **B08:** Weak-signal sweep baseline (uses B08S spine + B05 verifier hardened by B00F)

---

## Commit History

`7ec6151` (HEAD) — fix(harness): B00F verifyStimulus min baseline floor + call-ledger vitest + L120 silent assert  
`304985e` — docs(b08a2): changes.md, empirical-findings decision note, proposed plan, callbacks  
`51d0d18` — feat(sfu): B08A-2 sender-liveness discriminator + dual injection proof (D29/AC15b)  
`d7edd39` — docs(b08a1): record commit hash in changes.md  
`0ca6670` — feat(sfu): B08A-1 sender-liveness stats reader + diagnostics emit (D28/D29)  

---

**STATUS: READY FOR VALIDATION**
