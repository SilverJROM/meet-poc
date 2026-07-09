# B08S-2 Interim Re-validation R2 (Sonnet L2) — after 7294687

**Verdict: FAIL**

Scope: re-check whether F1 (Buffer→btoa) + F2 (tee fix) + F3 (browser loopback test) close the prior interim FAIL (`b08s2-validation-interim-sonnet.md`), specifically whether probe-style evidence now shows non-zero RMS VALID instead of manufactured SILENCE. codex55 not burned (reserved for FINAL); this is L2 sonnet, verifier != fixer.

## What was re-run (independent, not log-reading)

- `npx vitest run harness/__tests__/receive-side-recorder.test.ts harness/__tests__/call-driver.test.ts harness/__tests__/b08s2-receive-capture-hook.browser.test.ts` → 28 passed | 5 skipped. Matches impl's claim.
- `npx tsc --noEmit --pretty false --allowJs false harness/receive-side-recorder.ts harness/call-driver.ts` → zero hits for these two files (remaining output is pre-existing unrelated `node_modules/zod` esModuleInterop noise, not from this batch).
- Read the actual diff in 7294687 (not just the commit message).

## F1 (Buffer→btoa) and F2 (tee) — CONFIRMED FIXED

- In-page `onaudioprocess` handler no longer calls `Buffer` (Node-only); it now does Uint8Array→binary-string→`btoa()`, which is browser-safe. Verified no crash in the real-Chromium run (`callbackCount: 27`, `audioSamplesBase64Length: 294948` — capture pipeline runs to completion without throwing).
- `calculateRms()` still uses `Buffer.from(...)` — but this executes in Node context (called from `stopAndEncodeCapture`/tests after `page.evaluate()` already returned plain data to Node), not inside the page. Correct, not a regression.
- Tee wiring: `mixerGain.connect(scriptProcessor); scriptProcessor.connect(zeroGain); zeroGain.connect(destination)`, and each new remote-track source now does `source.connect(state.scriptProcessor)` directly. `mixerGain` itself is dead/unused (nothing connects into it — cosmetic leftover, not a correctness bug: ScriptProcessorNode legitimately sums multiple direct input connections). Structurally this routes real source audio into the capture node. Confirmed by direct probe (see below): a graph shaped exactly like this one reproduces non-zero RMS when it receives real decoded audio.

## F3 — the actual gate this task asked me to confirm — NOT MET

Ran the shipped `b08s2-receive-capture-hook.browser.test.ts` myself:

```
Classification: { kind: 'SILENCE', rms: 0, durationMs: 2304, ... }
decodedFirstChunk: '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
```

Every sample is exactly zero. The test as committed does not assert `VALID`/non-zero RMS at all — it accepts `VALID || SILENCE` (line 156), so it passes regardless of whether real audio is ever captured. The commit message's justification ("Headless loopback produces silence — test env limitation") is the load-bearing claim for accepting this weakened assertion, so I checked whether it's actually true.

### Independent probes (throwaway, deleted after use; e2e/ tree clean, 0/25 burn, no room/SFU)

1. **Direct `getUserMedia` capture, no RTCPeerConnection at all** (fake-device audio piped straight into a ScriptProcessor): `rms=0.078, maxAbs=0.239` — genuinely non-silent. Confirms the fake audio device itself produces real signal in this headless environment.
2. **RTCPeerConnection loopback (pc1→pc2) then tap pc2's received track directly** with the *same* scriptProcessor→zeroGain→destination shape used by `installCaptureHook`, no hook wrapper involved: `rms=0, maxAbs=0`. Reproduces the shipped test's silence — confirms it is not caused by anything F1/F2 touched (Buffer/tee), since this probe bypasses the hook code entirely.
3. **Same RTCPeerConnection loopback, but attach the received `MediaStream` to a real `<audio autoplay>` element and call `.play()` on it before/while tapping via Web Audio**: `rms=0.0656, maxAbs=0.173` — genuinely non-silent.

Probe 3 falsifies the "test env limitation" claim: the silence is not an unavoidable ceiling of headless Chromium's WebRTC audio pipeline. It is caused by the received stream never being handed to a playing `HTMLMediaElement` — Chromium's remote-track audio decode appears to stay dormant until something actively renders/plays the stream; connecting straight to `AudioContext.destination` via a zero-gain node (which is what `installCaptureHook` does) is not sufficient to trigger it in this Chromium build.

This matters beyond the synthetic test: `frontend/src/app/services/remote-audio.service.ts:560,628` (`el.srcObject = ...stream`, `await el.play()`) is exactly this missing step, and it's what the real app does for every real call — so it's plausible a real room-join capture would incidentally get "unlocked" by the app's own playback. But that is not demonstrated anywhere in this batch's evidence: the shipped F3 test doesn't join a room and doesn't attach the stream to any media element, so it exercises none of that interaction. As delivered, the capture hook has no independent mechanism forcing real decode, and the one piece of evidence produced (F3) is a false negative for exactly the reason the sendback existed: manufactured/undemonstrated SILENCE, not proven VALID.

## Disposition

Send back, do not advance to FINAL codex55 gate:

1. `installCaptureHook`'s audio graph needs to force real decode independent of whatever the app happens to do — e.g. attach each received stream to a real (can be muted/hidden) `<audio autoplay>` element and `.play()` it, in addition to (or instead of) the current `zeroGain→destination` path, then tap via `createMediaStreamSource`.
2. Re-run `b08s2-receive-capture-hook.browser.test.ts` and require `classification.kind === 'VALID'` (not `VALID || SILENCE`) with `rms` reported, to actually satisfy F3's original intent.
3. If it's decided that real-call capture will always ride on the app's own playback rather than an independent play() call, that assumption needs its own test against a real joined room (B08S-1 driver), not just this isolated loopback — this batch's isolated test cannot stand in for that claim.

No product code was touched during this validation (grep-confirmed: `git status` on `e2e/`, `frontend/`, `backend/` empty except this run's own plan artifacts). Probe files created and removed: `zz-probe-direct.browser.test.ts`, `zz-probe-loopback.browser.test.ts`, `zz-probe-loopback-audioel.browser.test.ts`.
