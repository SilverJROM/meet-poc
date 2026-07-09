# B08S-2 IMPLEMENTATION — design-locked (north approved)

**Role:** implementer L2 haiku  
**Design truth:** `decisions/2026-07-09-b08s2-receive-capture-hook-design.md` (+ north THREE GUARDS)  
**Batch notes:** `validation/b08s2-batch-notes.md`  
**Branch:** batch-01-diagnosis-2026-07-08  

## Core design (A-primary)
1. `page.addInitScript` on **unnavigated** receiver page BEFORE `page.goto`/join.
2. Shim wraps `RTCPeerConnection`; attach **`addEventListener('track', ...)`** in constructor (NOT `pc.ontrack =`).
3. Sole capture + discovery path. App `__meetDebug` registry = **corroboration only** (optional .meta.json). **Zero product changes** to sfu-client for discovery authority.
4. Lazy audio graph on first audio track; live mutable state on `window.__captureHookState` (not install snapshot).
5. Fail-closed: **no synthetic success WAV**. no-capture → throw/INVALID/no path. captured-silence → real WAV with real samples near-zero.
6. Provenance not amplitude.

## THREE GUARDS (north — mandatory)
1. Constructor config **UNMODIFIED** passthrough (`iceServers`, `iceTransportPolicy`, full RTCConfiguration). Test: shimmed PC gets app's exact config.
2. **Tee** not intercept: source → recorder AND original playback. Assert far-end still hears during capture.
3. `AudioContext.resume()`; assert `ctx.state === 'running'` before sample path else INVALID (not silence FAIL).

## Sequencing in call-driver
- Allocate receiver page → `addInitScript`/startReceiveSideRecording → join browsers → publish validate → inbound-ready wait → stopAndEncode.
- Do not install with evaluate-only after join.

## Tests (must pass)
- `npx vitest run e2e/harness/__tests__/call-driver.test.ts` 0 failed
- Navigation persistence (addInitScript survives goto)
- RTCConfiguration passthrough
- no-capture → no success WAV
- captured-silence path documented/tested with real silent track if feasible
- Temp dir per describe

## Out of scope
- Closing any AC
- Product SFU behavior changes beyond optional debug read
- Weakening synthetic rule

## Handshake
PROPOSED first (confirm design + three guards mapping) → wait APPROVED-PLAN → implement → commit → DONE callback.

Callbacks: `[projcore callback] impl B08S-2 STATUS: ...` to run-dir callbacks.md  
changes.md: validation/b08s2-changes.md (update)
