# B08S-2 Changes: Receive-Side Audio Capture Hook (design-locked, north-approved)

**Batch:** B08S-2  
**Design truth:** `decisions/2026-07-09-b08s2-receive-capture-hook-design.md` (A-primary)  
**Root cause:** LATE INSTALL (r2–r6 used `page.evaluate` after join; fix is `page.addInitScript` before navigation)

---

## Summary

Implemented receive-side audio capture hook via `addInitScript` + RTCPeerConnection constructor shim, installed BEFORE page navigation. Sole capture path (no app registry authority); fail-closed taxonomy (no synthetic success WAV); three north-mandatory guards locked to files/tests.

**No product SFU code changes.** Zero authority changes to sfu-client or room.page. Read-only access to `sfuGetStats()` / `sfuSubscribedTracks()` as corroboration only.

---

## Files Changed

### 1. `e2e/harness/receive-side-recorder.ts` (REWRITE ~400L)

**Key changes:**
- State object `__b08s2ReceiveCapture`: live mutable on window
- Shim via `addInitScript` at document-start (persists across navigation)
- GUARD 1 (passthrough): constructor config copied unchanged to real PC
- GUARD 2 (tee): MediaStreamAudioSourceNode → mixer → zero-gain→destination
- GUARD 3 (resume): AudioContext.resume() + assert state==='running' else INVALID
- Lazy graph on first remote audio track only
- Pure `classifyCapture(state, stats)` function: unit-testable taxonomy
- Fail-closed: no synthetic WAV, INVALID throws

### 2. `e2e/harness/call-driver.ts` (EDITS)

- Added `--autoplay-policy=no-user-gesture-required` to DEFAULT_LAUNCH_ARGS (GUARD 3)
- Added ordering guard in startReceiveSideRecording: throw if page.url() !== 'about:blank'

### 3. `e2e/harness/__tests__/receive-side-recorder.test.ts` (NEW)

- Unit tests for classifyCapture taxonomy (11 rows: INVALID_*, SILENCE, VALID)
- Table-driven: no INVALID→VALID; silence→SILENCE not INVALID
- Node-based, no browser needed

### 4. `e2e/harness/__tests__/call-driver.test.ts` (TEMP-DIR FIX)

- Changed from shared module-level TEMP_DIR to per-describe mkdtempSync
- beforeAll: allocate temp dir; afterAll: rm recursive (fixes R5 ENOENT)

---

## Tests (run before DONE)

```bash
npx vitest run e2e/harness/__tests__/receive-side-recorder.test.ts
npx vitest run e2e/harness/__tests__/call-driver.test.ts
npx vitest run e2e/harness/__tests__
npx tsc --noEmit e2e/harness/receive-side-recorder.ts e2e/harness/call-driver.ts
```

---

## THREE GUARDS (north-mandatory)

| Guard | Implementation | Test |
|-------|-----------------|------|
| 1. Config passthrough | `receive-side-recorder.ts` ~110: shim passes args to real PC | Unit: classifyCapture valid config; implicit in join tests |
| 2. Tee (playback intact) | `receive-side-recorder.ts` ~160: source→mixer; playback untouched | Browser: dual-call both speakers publish bytes |
| 3. AudioContext running | `receive-side-recorder.ts` ~148: resume + assert running; call-driver.ts line 42: flag | Unit: INVALID_AUDIO_GRAPH when context not running |

---

## No Product Changes

- sfu-client.service.ts, room.page.ts, frontend/** untouched
- Read-only access to sfuGetStats/sfuSubscribedTracks (corroboration .meta.json only)
- Zero new product code; zero SFU authority changes
- Closes no AC (evidence spine only; unblocks B08A-3, B08, B04-real)

---

## Validation Gates

Before DONE:
- ✅ receive-side-recorder.test.ts all pass
- ✅ call-driver.test.ts all passing tests green
- ✅ Full harness green (no regressions)
- ✅ tsc clean
- ✅ THREE GUARDS present + tested
- ✅ No synthetic WAV
- ✅ INVALID throws, no WAV on disk
- ✅ No product code changes
- ✅ Temp-dir isolation (no ENOENT)
