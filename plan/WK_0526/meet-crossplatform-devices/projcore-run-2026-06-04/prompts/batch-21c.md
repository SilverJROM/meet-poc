Batch-21c: Recorder tail — stop() timeout, discard double-stop race, zero-audio warn, MIME/Content-Type (REC4/5/6/8)

Batch ID: batch-21c
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-crossplatform-devices/projcore-run-2026-06-04
Branch: CONTINUE feat/crossplatform-devices-20260604 (B21b committed @ a70ec19). Do NOT commit (3-agent: projcore + independent 2nd validator before commit).
Read FIRST: north-star.md, findings.md (REC4 line 203, REC5 204, REC6 205, REC8 208).
You are CODEX (gpt-5.5), TUI bypass mode. Claude /projcore supervises + validates INDEPENDENTLY (3-AGENT: recorder lifecycle). NO scope creep.
Lifecycle: post-live, Deferral OFF. Effort tier (projcore-proposed): MEDIUM. Confirm/counter at PROPOSED.

## projcore already re-verified these are STILL OPEN (current sites below; confirm). Siblings REC7/REC9/REC10 ALREADY-FIXED (B18/recorder current) — NOT in scope.

## North-star tie-in
Recording must finish cleanly and be playable: no hang on stop (esp. iOS), no double-cleanup race on discard, host-with-no-audio is observable, and the saved file is labeled with its REAL format so it actually plays back.

## THE FINDINGS (confirmed OPEN by audit; current sites)
- **REC4 (stop() can hang)** — `frontend/src/app/pages/room/room.page.ts` ~line 1342: `const blob = await this.recorder.stop();` in the host toggle-recording path has NO timeout, so if MediaRecorder's `onstop` never fires (iOS/error) the await hangs forever. NOTE: a `withTimeout(promise, ms, fallback)` helper ALREADY exists (~line 3683) and is ALREADY used on the cleanup path (~line 1475: `withTimeout(this.recorder.stop(), 8000, null)`). Fix: wrap the ~1342 stop() (and its dependent upload, mirroring ~1475-1477) in the SAME existing `withTimeout` (reuse it; do not add a new helper). On timeout the UI must not get stuck "recording" — finalize the recording state gracefully.
- **REC5 (discard vs stop double-cleanup race)** — `frontend/src/app/services/recorder.service.ts`: `stop()` (~156) sets `recorder.onstop = () => { cleanupAudioGraph(); isRecording.set(false); resolve(blob); }` then calls `recorder.stop()`. `discard()` (~195) independently calls `recorder.stop()` again (if state==='recording') then immediately `cleanupAudioGraph()` + `isRecording.set(false)`. If discard runs while a stop() is pending, recorder.stop() is called twice (can throw on some browsers) AND cleanup/isRecording run twice + the pending onstop resolves a blob from already-cleaned state. Fix: a single-finalization guard (e.g. a `finalizing`/`disposed` flag) so the audio-graph cleanup + isRecording reset happen exactly once; discard must not double-call recorder.stop() when a stop is already in flight (check recorder.state and/or the guard); a pending onstop after discard is a no-op. Preserve: stop() still resolves its blob; discard() still fully tears down.
- **REC6 (host zero-audio silent exclusion)** — recorder.service.ts `addStream` ~line 231: `if (stream.getAudioTracks().length === 0) return;` silently — a host whose own stream has no audio track is excluded from their own recording with no diagnostic. Fix: `console.warn` (with the clientId/'local' context) when a stream is skipped for having no audio tracks, so a silent host-own-recording is observable. (Do not change the skip behavior — just make it visible.)
- **REC8 (MIME/Content-Type mislabel)** — recorder.service.ts: `this.mimeType = selected.mimeType || 'audio/webm'` (~117); the stop() blob is `new Blob(this.chunks, { type: this.mimeType })` (~163) and upload Content-Type is `blob.type || 'audio/webm'` (~179). When the picked mime is empty and the browser (e.g. Firefox) actually records ogg, the blob + Content-Type are wrongly stamped `audio/webm` → playback/serving breaks. Fix: stamp the ACTUAL recorded mime — prefer the live `this.recorder.mimeType` (the MediaRecorder's negotiated type) for the blob `type`, the stored extension, and the upload Content-Type; fall back to `this.mimeType`/'audio/webm' only when the actual is unavailable. Keep `pickMime` selection logic; just use the real negotiated type for the OUTPUT labeling.

## Required fix (acceptance)
1. REC4: host stop-recording cannot hang — bounded by the existing withTimeout; UI finalizes even if onstop never fires.
2. REC5: stop()/discard() cleanup + isRecording reset happen exactly once; no double recorder.stop(); a late onstop after discard is a harmless no-op; stop() still returns its blob; discard() still tears down.
3. REC6: a skipped no-audio stream logs a warn (host-own zero-audio is observable); skip behavior unchanged.
4. REC8: the recording blob type + extension + upload Content-Type reflect the ACTUAL recorded format (e.g. Firefox ogg labeled correctly), not a hardcoded audio/webm.
5. No regression: normal start/stop/upload, metadata upload, B18 resume/eviction/peer-resumed, B17 recorder LEAK2 dedupe, discard during active recording, the cleanup-path withTimeout at ~1475.

## Scope guards (MANDATORY — bypass mode)
- B21c ONLY (REC4/5/6/8). Touch: recorder.service.ts (REC5 guard, REC6 warn, REC8 actual-mime), room.page.ts (REC4 withTimeout at the toggle path). Plus tests.
- Do NOT touch: SFU/signaling/transport, media acquisition, active-speaker, B18 REC1/2/3 logic (resume/eviction/peer-resumed — call/keep intact), the existing withTimeout helper internals (reuse it), REC7/REC9/REC10 (already fixed).
- Prefer pure/isolated, testable seams (a finalize-once guard; a pure resolveRecordingMime(actual, fallback) helper). Robust assertions — assert the OUTCOME.

## Deterministic proof
- Unit specs (npx tsx): REC5 — stop-then-discard (and discard-then-late-onstop) cleans up exactly once + no double stop (mock MediaRecorder); REC8 — resolveRecordingMime picks actual over fallback + drives blob type/extension/Content-Type; REC6 — zero-audio stream triggers the warn path (spy/flag). REC4 — the toggle path uses withTimeout (assert via the helper / reasoned + build).
- Re-run recorder-leaks, room-recording, active-speaker-leaks specs (no regression). `npx ng build` green. Deploy DEV (`pm2 restart meet-poc-fe`).
- BE HONEST: real iOS stop-hang + real Firefox ogg playback is JROM's seat; unit proves the guard/mime logic.

## Plan handshake (MANDATORY)
1. Read brief + recorder.service.ts (stop/discard/cleanupAudioGraph/addStream/pickMime/mimeType/extension/upload) + room.page.ts toggle-recording (~1342) + the existing withTimeout (~3683) + the cleanup path (~1475).
2. Reply PROPOSED: REC4 withTimeout wiring, REC5 finalize-once guard design, REC6 warn, REC8 actual-mime approach (+extension/Content-Type), test plan, files, risks, estimate, complexity confirm/counter.
3. End: `STATUS: PROPOSED — <one-line> · complexity: <tier> · why: <one line>`. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green → tests → deploy DEV → STATUS: DONE. Do NOT commit (3-agent).

## Artifacts (under <run-dir>/validation/B21c/)
scenarios.md, changes.md (Root Cause per REC + per-file WHY + honest note), review.md, test-report.md, independent-validation.md. decisions/ entry for the finalize-once + mime strategy.

## Completion protocol
- FIRST on any state change: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] batch-21c <PROPOSED|DONE|BLOCKED|NEEDS-INFO> <one-line>` — BEFORE prose.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
