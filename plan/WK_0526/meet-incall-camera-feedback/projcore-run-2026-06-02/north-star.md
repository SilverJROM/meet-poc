# North Star — meet-incall-camera-feedback (2026-06-02)

**Append-only.** Triggered by JROM's local (PH) call today, session `5d9ec218-90ff-4d0b-8d1f-3456672bdf97` (03:54–03:56). That call ALSO confirmed the prior B1 host-audio-playout fix works live (host emitted 2.7M + 1.07M). Two NEW requests.

## Requirements (JROM verbatim)
> "allow the user to enable the camera inside the call, even when they have not allowed it prejoining the call."
> "fix the feedback when the caller and the called is within the same location ... feedback that is happening when the mic is on and the speaker of the caller called are within range ... add a sort of filter to not let this feedback happen, you can see it on the logs."

## Diagnosis (from code + session 5d9ec218)
- **Camera (B1):** `media.service.ts toggleCamera` first line is `const stream = this.localStream(); if (!stream) return false;`. If the user joined WITHOUT acquiring any media (camera off / not granted pre-join → no local stream), the in-call camera button silently no-ops. (Mic-only-with-stream works: it re-prompts getUserMedia for video.) Fix the no-stream path so camera can be enabled in-call; handle hard-deny (NotAllowedError) with an actionable message.
- **Feedback (B2):** acoustic coupling between two co-located devices. Timeline shows host outbound level spiking (0.46→0.19) as the 2nd party joins in the same room, then host muted to kill it. Capture uses `echoCancellation: { ideal: true }` (a hint, not enforced). Per-device EC cannot cancel a SECOND device's speaker bleeding into this device's mic. Output mixer gain allows >1.0 (MAX_VOLUME 1.3) which can amplify a loop.

## JROM decision (frontloaded, 2026-06-02)
Feedback mitigation = **SUPPRESSION ONLY**. Force EC/NS/AGC + software feedback suppression on the audio path. **NO detection UI, NO auto-mute, NO warning banner.** Non-intrusive. (See decisions/feedback-approach.md.)

## Non-negotiables
- **NS1 — In-call mic AND camera are never stiff (JROM 2026-06-02):** regardless of pre-join state, both controls stay clickable and every click on an OFF/absent control RE-ATTEMPTS acquisition (re-asking permission) + publishes. No app-level grey-out/lockout/dead-end. Browser hard-block is the only residual (platform-enforced) limit — re-attempt each click + gentle unblock hint, never permanently disable. Covers BOTH mic and camera.
- **NS2 — Feedback: suppression only.** Enforce EC/NS/AGC (gracefully — don't break capture on devices that reject `exact`), add software suppression (e.g. limiter/compressor on the mixer output, no >1.0 amplification by default). No UI, no auto-mute. Honest: this REDUCES, cannot 100% eliminate, two-device room feedback — document that.
- **NS3 — No regression:** don't break existing camera toggle (mic-only-with-stream path), the B1 remote-audio playout fix, the B2 mic-persistence fix, volume/mute-all, or device selection.
- **NS4 — Deterministic proof:** unit/logic where a pure decision exists (constraint builder; camera-acquire decision); manual localhost notes for the rendered behavior; live = JROM seat (real two-device room for feedback; real permission states for camera).
- **NS5 — Surgical.** Camera: media.service.ts toggleCamera + room.page toggleCamera error UX. Feedback: mic-energy.ts audioCaptureConstraints + remote-audio.service.ts mixer graph. Do NOT touch SFU subscribe/transport, diagnostics, layout.

## Lifecycle
post-live. Branch off master @ HEAD (a4c81cc). Verifier ≠ fixer. One batch at a time.
B1 = camera-in-call. B2 = feedback suppression.
