/lead — HYPER-FOCUSED IMPLEMENTER for ONE batch (B1). Claude /projcore supervises + validates INDEPENDENTLY. NO scope creep. Do exactly B1.

Batch ID: B1 — Host remote-audio playout (R1)
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-audio-playout/projcore-run-2026-06-01
Branch: feat/host-audio-playout-mic-persist-20260601 (already created off master @ d3591e4). Commit on top.
Read FIRST: north-star.md, og-requirements.md (R1), diagnosis-evidence.md. (Diagnosis is DONE — do not re-diagnose the DB; confirm the mechanism in CODE + a repro.)
Lifecycle: post-live, Deferral OFF (tests required).
Estimated: ~30min.

## THE BUG (already diagnosed from the live call — session b35a94c9)
The HOST receives a remote participant's audio RTP cleanly (1.4 MB, ~0 loss, 0 concealment) but `jitterBufferEmittedCount` stays **0** — the audio is on the wire but never rendered to the host's speaker. ONLY the host fails; every other participant plays remote audio fine (emitted in the millions). Not a capture bug, not network, not SFU.

## Mechanism to CONFIRM then FIX (file:line)
- When `remoteAudioMixerEnabled()` is true, per-tile `<audio>` are silenced by design (`[remoteAudioEnabled]="false"` in room.page.html:238 etc → tile.component.ts:58 sets srcObject=null). So the SOLE playout path is the Web-Audio mixer in `frontend/src/app/services/remote-audio.service.ts`: peer track → `createMediaStreamSource` → gain → `MediaStreamAudioDestinationNode` → `#remoteAudioMixer` element.
- A `MediaStreamAudioSourceNode` only pulls samples (→ emitted>0, → sound) when its **`AudioContext.state === 'running'`**. A **suspended** context ⇒ emitted stays 0 AND silence. That is the exact data signature.
- `unlockAndPlayRemoteSinks` (remote-audio.service.ts:90) and `allSinksPlaying` (:133) check only `outputElement.paused` — **never `this.context.state`**. So a suspended context + non-paused element returns `allPlayable=true` ⇒ the `remoteAudioBlocked` banner (room.page.html:206) never shows ⇒ host hears nothing with NO warning and NO recovery.
- Host-specific because: the unlock gesture happens while the host is alone (0 sources ⇒ `output.play()` skipped at :112), and/or `AudioContext.resume()` is invoked from `setTimeout(0)` (room.page.ts:553) that has lost the user-gesture transient activation, so resume is silently rejected and never retried with a real gesture.

## Required fixes (R1 acceptance — see og-requirements.md)
1. **Honest playability detection (R1.2):** `unlockAndPlayRemoteSinks` return value AND `allSinksPlaying()` MUST treat "mixer enabled + sources.size>0 + `context.state !== 'running'`" as NOT playable. This makes `remoteAudioBlocked` surface so the user gets the one-tap "enable audio" recovery. Do not report playable when the context is suspended.
2. **Re-arm (R1.3):** attempt `context.resume()` + mixer `output.play()` on genuine user gestures AND whenever a source is added while the context is not running. The existing per-peer-change effect (room.page.ts:550-556) re-runs unlock in a `setTimeout` — ensure that path actually resumes/plays, and that real gesture entry points (join/tap-to-enable banner) reliably resume. Prefer resuming the context synchronously within the gesture call stack (before the first `await`) so transient activation isn't lost.
3. **Prove playout (R1.1, NS1):** add a deterministic proof that remote audio is actually rendered — a Playwright two-context test if feasible (two browser contexts, fake media, assert the receiver's `jitterBufferEmittedCount` increases for the joiner-first/host side), OR at minimum a unit/logic test over the playability decision PLUS a localhost repro note dumping `remoteAudio.debugSnapshot()` showing `contextState:'running'` + emitted climbing. The bug hid precisely because `play()` resolved while the context was suspended — a test that only asserts "play() resolved" is INSUFFICIENT (NS1).
4. **No regression (R1.4):** participants who already hear audio must keep hearing it; volume + mute-all (`setMutedAll`/`setVolume`) keep working. Don't break the mixer for the majority.

## Scope guards (NS6 — surgical)
- B1 ONLY. Touch the remote-audio PLAYOUT path: `services/remote-audio.service.ts`, the unlock/effects in `pages/room/room.page.ts`, and the `remoteAudioBlocked` banner wiring/template if needed. Plus tests.
- Do NOT touch: SFU subscribe/transport, sender capture/mic-energy, diagnostics schema/attribution, the B3 diagnostics toggle, device-selection persistence (that's B2 — separate), layout/grid.
- If you find the real mechanism differs from the hypothesis above, that's FINE — fix the actual root cause, but DOCUMENT the divergence in changes.md with the evidence (debugSnapshot before/after). Mechanism-level Root Cause required, not symptom patching.

## Plan handshake (MANDATORY)
1. Read the briefs + the 3 files (remote-audio.service.ts, tile.component.ts, room.page.ts unlock/effects + template banner).
2. Reply PROPOSED: confirmed mechanism (cite file:line + how you'll repro), the exact detection change, the re-arm change, the test approach (can you do a 2-context Playwright emitted-count assertion? if not, what's the fallback proof), files touched, risks, estimate.
3. End: `STATUS: PROPOSED — <one-line>`. WAIT for APPROVED-PLAN. (REVISE-PLAN → fix → re-emit.)

After APPROVED-PLAN: implement → build green (FE; BE if touched) → run the new tests → deploy to DEV (`pm2 restart` per project_specs) → STATUS: DONE.

## Artifacts (under <run-dir>/validation/B1/)
scenarios.md, changes.md (Codex-style: Root Cause at the mechanism level + before/after debugSnapshot), review.md, test-report.md, screenshots/ (banner shown + console debugSnapshot). decisions/ entry for the playability-detection threshold/approach.

## Completion protocol
- FIRST action on finishing/blocking: append ONE line to <run-dir>/callbacks.md:
  `[projcore callback] B1 <DONE|NEEDS-CLARIFICATION|BLOCKED> <one-line>`
  — write this BEFORE your prose summary.
- End EVERY reply with: `STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>`.
