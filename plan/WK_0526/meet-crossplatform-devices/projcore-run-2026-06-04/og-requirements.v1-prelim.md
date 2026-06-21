# og-requirements.md — meet-crossplatform-devices (contract)

## R1 — Camera & mic open on ALL devices (exact-deviceId fallback)
getUserMedia must not fail to open the camera or mic just because a persisted/selected deviceId doesn't exist on the current device (Android, PC, external cam/mic). 

Acceptance:
1. When acquisition with `deviceId:{exact}` throws OverconstrainedError/NotFoundError, the code RETRIES without the exact deviceId (ideal or dropped; facingMode preserved on mobile) and succeeds with an available device. Applies to camera AND mic.
2. All acquire paths covered: lobby preflight/reacquire, in-call toggleCamera, in-call toggleMic, replaceAudioTrack, replaceVideoTrack.
3. In-call camera enable after joining without camera works on a device whose saved id doesn't match (the failing case) — opens + publishes.
4. When the exact id DOES match (macbook), behavior unchanged (still uses the selected device).
5. Proof: unit test the constraint-builder + fallback decision (exact→retry-without). Real Android/PC/external = JROM seat (fake-media cannot reproduce OverconstrainedError — explicitly NOT claimed via e2e).
6. No regression: macbook/iphone path, device selection when matching, mic-persistence, audio playout/watchdog, camera-in-call, feedback limiter.

## R2 — Diagnostics capture platform + device + acquisition errors
The diagnostics payload records enough to diagnose cross-platform device failures from the DB.

Acceptance:
1. Payload includes platform/userAgent (or parsed os/browser), the selected + active audio/video device ids, and the last getUserMedia error name (e.g. OverconstrainedError/NotAllowedError) if any.
2. Queryable so a host/admin can see device-type + acquisition failures per participant (today: invisible).
3. Idempotent migration if new columns added; gated by existing diagnostics on/off.
4. No regression to existing diagnostics.

## Out of scope
SFU subscribe/transport, layout, mic-join-gate, the prior audio/camera/feedback fixes (don't regress).
