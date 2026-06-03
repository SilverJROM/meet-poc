Batch-1: Make remote voice actually play — kickstart audio element (Chromium #121673) + automatic AudioContext recovery (R1)

Batch ID: batch-1
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-host-audio-recovery/projcore-run-2026-06-03
Branch: create feat/host-audio-recovery-20260603 off master @ HEAD. Commit on top.
Read FIRST: north-star.md (esp. WEB RESEARCH + NS sections), og-requirements.md (R1).
You are CODEX, TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): HIGH (audio lifecycle/timing). Confirm/counter at PROPOSED.

## THE BUG (diagnosed by projcore from DB + WEB RESEARCH — confirm in code, do not re-diagnose DB)
Host-only remote-audio playout failure, recurring. Session 45197347 (2026-06-02 19:46–19:51 Manila): host received guest's audio RTP (bytes 4368→151984) but jitterBufferEmittedCount stayed **0** — never rendered. Guest heard host fine. Prior fix addressed only the suspended-AudioContext half (and relied on a banner tap). It MISSED the fundamental cause:

**Chromium bug #121673 (web-confirmed, still required 2025):** a remote WebRTC track fed into Web Audio via `createMediaStreamSource` produces NO sound UNLESS the same MediaStream is ALSO attached to a muted, PLAYING HTMLAudioElement to kickstart the pipeline. Canonical workaround:
```
const a = new Audio(); a.srcObject = stream; a.muted = true; a.play();   // kickstart
const src = ctx.createMediaStreamSource(stream); src.connect(gain); // mixer as before
```
OUR CODE does the opposite: when the mixer is enabled, the per-tile `<audio>` are set `srcObject=null` (frontend/src/app/components/tile/tile.component.ts:58, via `[remoteAudioEnabled]="!remoteAudioMixerEnabled()"`). So NO element ever kickstarts the remote stream → the Web-Audio mixer (remote-audio.service.ts: source→gain→limiter→destination) can be silent. Combined with autoplay/idle context-suspend, the host hears nothing.
Sources in north-star: w3c/webrtc-pc#2564, Babylon.js forum 7047, chromium 121673.

## Required fixes (R1 acceptance)
1. **Kickstart element per remote source (#121673) — PRIMARY:** in remote-audio.service.ts, when a remote source is added to the mixer (addSource/syncPeers), ALSO create/attach a hidden, **muted**, autoplay HTMLAudioElement whose `srcObject` = that peer's MediaStream, and `.play()` it. Muted so there's no double audio (the audible path stays the mixer/gain). Manage its lifecycle: create on source-add, remove/stop on source-remove and reset. This is the core fix that makes the mixer actually produce sound in Chrome.
2. **Automatic AudioContext recovery (no banner tap):** resume the context on ANY in-call user interaction (self-removing global pointerdown/click/keydown listener, re-armed if it suspends again) AND keep it warm so it doesn't auto-suspend during an idle host-alone period (e.g. resume on visibilitychange + re-resume whenever a source is added). Keep the existing remoteAudioBlocked banner as a LAST-RESORT fallback only.
3. **Source-add resume:** when syncPeers adds a source while context !== 'running', attempt resume() + output.play() immediately (not only set the banner).
4. **No regression:** volume()/setVolume, mutedAll/setMutedAll (gain=0 ⇒ silence — kickstart elements are muted so they don't leak), the B2 DynamicsCompressor limiter, mic-persistence, in-call camera, common-case playout. Re-run existing remote-audio specs.

## Scope guards (MANDATORY — bypass mode, brief is the only guardrail)
- B1 ONLY (R1). Touch: frontend/src/app/services/remote-audio.service.ts (kickstart elements + context keepalive + resume + source-add resume) and frontend/src/app/pages/room/room.page.ts (global interaction listener wiring + lifecycle). Plus tests. The kickstart elements can live in the service (document.createElement('audio'), appended hidden) — do NOT require template changes unless cleaner.
- Do NOT touch: SFU subscribe/transport, capture/mic-energy, diagnostics schema, layout/grid, device picker, B2 limiter params, mic-join-gate, tile.component.ts behavior for the NON-mixer path.
- Do NOT delete files outside run-dir. Surgical, no "while I'm here".
- Reuse existing graph + signals (ensureGraph, contextState, outputPlaying, evaluateRemoteAudioPlayability). Extend, don't rewrite.
- Robust polled assertions — assert the OUTCOME (emitted climbs / context 'running'), never just that a function was called.

## Deterministic proof (prove the path prior validation MISSED)
- A test modeling: mixer source added → assert a muted playing kickstart <audio> with that srcObject exists; context suspended → interaction/source-add → assert context 'running'. If a 2-context Playwright with real fake-media can show jitterBufferEmittedCount climbing for the host after a late join, include it; else logic/unit + a localhost note (be honest which).
- Re-run remote-audio-playability, remote-audio-health, feedback-limiter specs (no regression).
- node:assert specs via `npx tsx <spec>`; build `npx ng build`; deploy DEV `pm2 restart meet-poc-fe`.

## Plan handshake (MANDATORY before code)
1. Read brief + north-star + og-requirements + remote-audio.service.ts (addSource/removeSource/syncPeers/ensureGraph/unlockAndPlayRemoteSinks/resumeContext) + room.page.ts unlock effects + tile.component.ts:58.
2. Reply PROPOSED: confirmed mechanism (file:line), kickstart-element design + lifecycle, auto-resume + keepalive approach, source-add resume, test plan for the missed path, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B1/)
scenarios.md, changes.md (User Report verbatim + Root Cause incl. #121673 citation + per-file WHY), review.md, test-report.md, screenshots/, independent-validation.md. decisions/ entry for kickstart + keepalive choices.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-1 <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
