# og-requirements.md — meet-incall-camera-feedback (contract)

## RC — In-call mic AND camera are always enable-able; never stiff (B1)
JROM directive (verbatim): "whatever the case pre-joining don't grey-out or unallow click of the camera or mic inside the call. just re-ask for the users permission if they want to activate it inside the call. no hard deny BS, just full customizability here, the app should not be too stiff here."

So: regardless of pre-join state (camera/mic off, skipped, or previously denied), the in-call mic and camera controls are ALWAYS clickable, and clicking one that is OFF/absent ATTEMPTS to acquire it fresh (re-asking browser permission), then publishes it. The app must never be the thing blocking activation.

Current bugs (both no-op when the track/stream is absent):
- `media.toggleMic()` — `const track = localStream()?.getAudioTracks()[0]; if (!track) return false;` (no acquire).
- `media.toggleCamera()` — `const stream = localStream(); if (!stream) return false;` (no acquire when no stream).
Buttons aren't literally `disabled`, but the action no-ops and the `is-off` styling looks dead.

**Acceptance (observable):**
1. **Mic:** joined with mic off/absent → clicking the in-call mic button ACQUIRES an audio track (getUserMedia, re-asking permission), adds + publishes it, remote peers hear it. Toggling off/on after works.
2. **Camera:** joined with camera off/absent (incl. the no-localStream case) → clicking the in-call camera button ACQUIRES a video track (getUserMedia, re-asking permission), adds + publishes it, remote peers see it. Toggling off/on after works.
3. **Never stiff / no dead-end:** the buttons are never disabled/locked-out based on pre-join permission state; every click re-attempts acquisition. If the browser itself rejects (a prior hard "Block" — the one thing a web app genuinely cannot force a re-prompt for), the app still RE-ATTEMPTS on each click and shows a brief, non-blocking hint on how to unblock — it must NOT permanently disable the control or dead-end the user. (Honest platform note: getUserMedia only re-prompts when permission state is "prompt"; "denied" is browser-enforced. Re-attempt + keep-live + gentle hint is the max the platform allows and satisfies "not stiff".)
4. No regression to the already-working "camera/mic off-with-stream → enable" path, screen-share toggle, or device selection.
5. Unit/logic-provable where a decision exists (e.g. acquire-vs-flip decision per media kind); manual localhost note for the states (off-with-stream, no-stream, browser-blocked) for BOTH mic and camera.

## RF — Same-room feedback suppression, suppression-only (B2)
When caller and callee are within speaker/mic range (same room), an acoustic feedback loop occurs. Reduce it via software suppression only.

**Acceptance (observable):**
1. Capture constraints ENFORCE echoCancellation + noiseSuppression + autoGainControl (strengthened from `{ideal:true}`) — applied in a way that does NOT break capture on devices that reject `exact` (graceful fallback).
2. A software feedback suppressor on the audio output/mixer path (e.g. a limiter/compressor node; no default amplification >1.0 that worsens a loop) reduces runaway feedback.
3. **NO** detection UI, **NO** auto-mute, **NO** warning banner (per JROM decision — suppression only).
4. No regression to remote-audio playout (B1 prior), volume/mute-all, or device selection.
5. Honest documentation: this reduces but cannot fully eliminate two-device acoustic feedback (headphones / muting one device remains the only total fix). Unit/logic for the constraint builder + graph wiring; live = JROM two-device room test.

## Out of scope (NS5)
SFU subscribe/transport, diagnostics schema, layout/grid, the prior audio-playout & mic-persistence fixes (don't regress them). No feedback detection UI / auto-mute (explicitly excluded by JROM).
