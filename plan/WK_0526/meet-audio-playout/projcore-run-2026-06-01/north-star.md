# North Star — meet-audio-playout (2026-06-01)

**Append-only. Every batch decision anchors here.**

## The call that triggered this run
Session `b35a94c9-bcdd-409d-9969-d34438025f3b` (2026-06-01 23:26–23:36, room 4c495f256f63).
Participants: **silverjrom** (JROM, host), **peer2** (US user, laptop), **Phone Peer2** (same user, phone).
JROM could be heard + seen by Peer2, and Peer2's **screen-share + video reached JROM** — but **JROM could not hear Peer2** (laptop OR phone). Same symptom yesterday; yesterday's fix (sender-side silent-mic) was real but addressed a *different* failure mode. This is NOT a capture bug.

## Diagnosis (proven from the diagnostics DB — see diagnosis-evidence.md)
**Audio playout matrix (viewer → publisher, max `jitterBufferEmittedCount`):**
- peer2 → silverjrom: emitted **25.6M** (Peer2 hears JROM ✓)
- PhonePeer2 → peer2 / jrom: emitted **3.0–3.6M** ✓
- **silverjrom → peer2(laptop): bytesReceived 1.4M, emitted 0 ✗**
- **silverjrom → PhonePeer2: bytesReceived 157K, emitted 0 ✗**

JROM receives Peer2's audio RTP cleanly (1.4 MB, ~0 packet loss, 0 concealment) but the jitter buffer **emits zero samples to playout** — i.e. the audio is on the wire but never rendered to the host's speaker. Only the host fails; everyone else plays remote audio fine.

**Root-cause mechanism (to confirm via repro):**
- When the mixer is enabled (`remoteAudioMixerEnabled()`), per-tile `<audio>` are silenced by design (`[remoteAudioEnabled]="false"`, tile.component.ts:58). The SOLE playout path is the Web-Audio mixer: peer track → `MediaStreamAudioSourceNode` → gain → `MediaStreamAudioDestinationNode` → `#remoteAudioMixer` element (remote-audio.service.ts).
- A `MediaStreamAudioSourceNode` only pulls samples (→ emitted>0) when its **`AudioContext.state === 'running'`**. A **suspended** context produces silence AND keeps `jitterBufferEmittedCount` at 0 — exact match for the data.
- `unlockAndPlayRemoteSinks` / `allSinksPlaying` check only `outputElement.paused`, **never `context.state`**. A suspended context + non-paused element returns `allPlayable = true` → the existing `remoteAudioBlocked` "tap to enable audio" banner (room.page.html:206) **never shows**, so the host hears nothing with no warning and no recovery affordance.
- Why host-only: the host typically performs the unlock gesture while alone (0 sources → `output.play()` skipped at remote-audio.service.ts:112) and/or the `AudioContext.resume()` fires from a `setTimeout(0)` (room.page.ts:553) that has lost the user-gesture transient activation, so resume is silently rejected and never retried with a real gesture.

## Non-negotiables
- **NS1 — Prove playout, not just "no error":** acceptance requires `jitterBufferEmittedCount` climbing (or an equivalent observable that the remote audio is rendered), not merely that `play()` resolved. The whole reason this bug hid is that `play()` succeeded while the context was suspended.
- **NS2 — Detection must be honest:** the playability check MUST treat a suspended/non-running `AudioContext` (when sources exist) as NOT playable, so the `remoteAudioBlocked` banner surfaces and the user has a one-tap recovery.
- **NS3 — Re-arm on real gestures:** `AudioContext.resume()` + mixer `play()` must be (re)attempted on genuine user gestures and whenever a remote source is added while the context is not running — not only once at join.
- **NS4 — No regression to the working direction:** guests/non-hosts who already hear audio must keep hearing it; do not break the mixer for the majority. Volume/mute-all controls keep working.
- **NS5 — Deterministic proof:** logic/unit tests over the playability decision (suspended-context ⇒ not-playable; running+sources+unpaused ⇒ playable) + the mic-persistence decision; a Playwright two-context test if feasible; manual localhost note for the rendered banner. Live two-machine confirmation is JROM's seat (headless can't prove real speaker output).
- **NS6 — Surgical:** touch only the remote-audio playout path (R1) and the device-selection persistence path (R2). Do NOT touch SFU subscribe/transport, capture/mic-energy, diagnostics schema, B3 toggle, layout.
- **NS7 — Deferral OFF** (post-live hardening): tests required, commit on top of the feature branch.

## Lifecycle
post-live. Branch `feat/host-audio-playout-mic-persist-20260601` off master @ d3591e4.
Verifier ≠ fixer (projcore validates independently). One batch at a time.
