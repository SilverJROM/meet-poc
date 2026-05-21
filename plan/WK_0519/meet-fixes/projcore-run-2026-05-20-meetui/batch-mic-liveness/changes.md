# Batch MIC-LIVENESS Changes

User Report verbatim:
> Goal: flag a published-but-SILENT mic in the diagnostics log (known Chrome bug: getUserMedia succeeds on an external mic but captures no data => "other side can't hear me"). Capture the LOCAL OUTBOUND audio level — from getStats media-source (kind=audio: audioLevel + totalAudioEnergy) OR reuse the existing media.service mic-meter (propose which) — derive a micSilent signal (mic enabled but level ~0 across a few samples), add it to the diagnostics payload, and display it in /app/diagnostics with an OBVIOUS red flag when silent-but-enabled. CAPTURE/FLAG ONLY — no auto-recover/re-acquire in this batch.

Root Cause mechanism:
DR-28/DR-33 logged sender device identity and receive-side audio, but did not record whether the local captured microphone was actually producing audio. Chrome can publish a live external mic track after successful getUserMedia while the media source remains silent, so the previous diagnostics could show the correct mic as published without proving it had outbound audio.

Per-file WHY:
- `frontend/src/app/services/webrtc.service.ts`: samples `pc.getStats()` `media-source` audio stats once per quality interval, stores `outboundAudioLevel`, `outboundAudioEnergy`, and derives `micSilent` after 3 enabled/live low-level flat-energy samples. Quality classification and DR-33 inbound counters are unchanged.
- `frontend/src/app/services/meeting-sessions.service.ts`: adds top-level local-client diagnostics payload fields.
- `frontend/src/app/pages/room/room.page.ts`: persists the new top-level fields with each diagnostics payload.
- `frontend/src/app/pages/diagnostics/*`: displays mic liveness and renders the red flag only when `micSilent === true`.
- `e2e/tests/v3-mic-liveness/mic-liveness.spec.ts`: proves the fields are present in persisted diagnostics and that flowing fake audio is false-or-null, not alarming.

Caveats / deferred:
- Auto-recover or re-acquire for silent external mics is intentionally deferred. A future batch can use this signal to offer a gentle re-acquire flow after a longer silent window, but this batch is capture/flag only.
