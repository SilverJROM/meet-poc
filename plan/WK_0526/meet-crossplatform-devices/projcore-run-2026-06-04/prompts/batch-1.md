Batch-1: Camera & mic open on ANY device — exact-deviceId OverconstrainedError fallback (R1)

Batch ID: batch-1
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: create feat/crossplatform-devices-20260604 off master @ HEAD. Commit on top.
Read FIRST: north-star.md, og-requirements.md (R1), diagnosis-evidence.md.
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM. Confirm/counter at PROPOSED.

## THE BUG (CONFIRMED by projcore — code + web; confirm, don't re-derive from DB)
macbook↔iphone works; Android / PC-with-external-cam-mic fail to open camera/mic; in-call camera enable after no-cam-join fails on those devices ("previous fix didnt work").

Root cause: `frontend/src/app/services/media.service.ts` `videoConstraints()` and `frontend/src/app/services/mic-energy.ts` `audioCaptureConstraints()` both build `deviceId: { exact: <id> }` when a device is selected/persisted, with NO fallback. `exact` is a MANDATORY constraint → getUserMedia throws **OverconstrainedError** (or NotFoundError) when that exact deviceId is not present on the CURRENT device. The macbook's persisted id matches → works; any other device (Android, PC, external cam/mic, or just a different machine than where the id was saved) → throws → camera/mic never opens. There is NO catch/retry-without-exact anywhere.

Why it slipped past tests: fake-media (--use-fake-device-for-media-stream) accepts ANY deviceId, so OverconstrainedError never occurs headless. **Do NOT rely on fake-media e2e as proof for this batch** — it cannot reproduce the bug.

## Required fix (R1 acceptance)
1. **Graceful exact→fallback acquisition (PRIMARY):** wherever getUserMedia is called with a `deviceId:{exact}` (video AND audio), catch OverconstrainedError / NotFoundError and RETRY once without the exact deviceId constraint — fall back to `{ideal: <id>}` or drop the deviceId entirely (preserve facingMode + width/height ideals on mobile). Prefer a single shared helper (e.g. acquireWithDeviceFallback) so every path benefits and it's unit-testable. The camera/mic must OPEN on any device even when the saved id doesn't match.
2. **Cover ALL acquire paths:** preflight, reacquire, toggleCamera, toggleMic, replaceAudioTrack, replaceVideoTrack — every getUserMedia that may carry an exact deviceId.
3. **Exact-match unchanged:** when the exact id IS present, still use it (no behavior change for macbook/selection). After a fallback, update selectedAudioId/selectedVideoId to the actually-acquired device id (reuse B-prior resolveSelectedAudioId spirit) so the picker reflects reality and storage doesn't keep a dead id.
4. **Secondary — check the publish path:** confirm that an in-call-enabled camera actually PUBLISHES to remote (replaceTrack on the video sender). If the video transceiver isn't pre-negotiated on some browsers, or resolution exceeds negotiated bounds → local preview shows but remote sees nothing. If you find a real gap, fix it minimally + document; if it's already robust, note it.
5. **No regression:** macbook/iphone path, device selection when matching, mic-persistence, audio playout/watchdog, in-call camera (prior), feedback limiter.

## Scope guards (MANDATORY — bypass mode)
- B1 ONLY (R1). Touch: media.service.ts (videoConstraints + a shared acquire-with-fallback + the acquire call sites), mic-energy.ts (audioCaptureConstraints — but the fallback retry logic lives in media.service since mic-energy is a pure builder), room.page.ts only if a call site needs the fallback wired. Plus tests.
- Do NOT touch: SFU subscribe/transport internals, layout, mic-join-gate, diagnostics (that's B2), the prior audio/feedback fixes.
- Do NOT delete files outside run-dir. Surgical.
- Robust polled assertions — assert the OUTCOME.

## Deterministic proof (NS2 — fake-media CANNOT prove this)
- Unit spec (npx tsx) over the constraint-builder + fallback decision: given exact id + a simulated OverconstrainedError, the retry constraints drop/relax the exact deviceId; given exact id present, it's kept. Test the pure logic (mock getUserMedia rejection).
- Re-run existing specs (remote-audio-*, feedback-limiter, device-selection, media-toggle) for no regression. ng build green. Deploy DEV (pm2 restart meet-poc-fe).
- BE HONEST: state in changes.md that real Android/PC/external camera+mic open is JROM's seat — fake-media e2e cannot reproduce OverconstrainedError, so do NOT claim it proven by e2e.

## Plan handshake (MANDATORY)
1. Read brief + diagnosis + media.service.ts (videoConstraints, acquire, preflight/reacquire/replaceAudioTrack/replaceVideoTrack/toggleCamera/toggleMic) + mic-energy.ts audioCaptureConstraints.
2. Reply PROPOSED: the shared fallback helper design + which call sites + the OverconstrainedError/NotFoundError handling + selected-id-update-after-fallback + the publish-path finding + test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B1/)
scenarios.md, changes.md (Root Cause incl. OverconstrainedError + the HONEST "real-device=JROM seat" note + per-file WHY), review.md, test-report.md, independent-validation.md. decisions/ entry for the fallback strategy.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-1 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
