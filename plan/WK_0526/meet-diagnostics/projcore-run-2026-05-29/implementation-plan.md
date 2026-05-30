# implementation-plan — diagnostics + on/off switch + one-way-audio fix

Branch base: `81661dd` · Feature branch: `feat/meet-diagnostics-audio-20260529`

Ordered atomic-ish slices. /lead implements one batch at a time after a PROPOSED→APPROVED-PLAN handshake. If a batch's PROPOSED plan is >30min / many-test / sprawling-diff, propose a split.

## B1 — Local mic-energy metric into diagnostics (R1)  [FOUNDATION]
Populate real `outboundAudioLevel`, `outboundAudioEnergy`, `micSilent` in every diagnostic `sample`, for host AND guests. Reuse the existing lobby mic-meter / Web Audio analyser if present; else add a lightweight AnalyserNode on the local audio track. Expose a `localAudioLevel`/`micSilent` signal and thread it into `buildDiagnosticsPayload`.
- Proof: a fresh `sample` row has non-null `outboundAudioLevel`; with mic muted/track silent → `micSilent:true`; with audio → level > 0 and `micSilent:false`.
- Likely: `frontend/src/app/services/media.service.ts`, `room.page.ts` (buildDiagnosticsPayload ~line 2428), any existing mic-meter component.

## B2 — ROOT-CAUSE the silent capture, then add the watchdog (R2, R3)  [THE FIX — per NS9]
Hardware is confirmed good (user tested mic + it worked on Meet) ⇒ the silent published audio is OUR capture bug. **Root-cause FIRST, watchdog SECOND.**

Root-cause (B2a — the real fix, per NS9):
- **(a) Device selection:** verify the picker's chosen deviceId actually reaches getUserMedia on join AND persists lobby→in-call; fix any path where we silently fall back to the system default (built-in/dead) instead of the external mic, or where a `deviceId:{exact}` failure silently yields a wrong/empty track.
- **(b) Constraints:** `AUDIO_PROCESSING_CONSTRAINTS` (media.service.ts ~line 34) forces EC/NS/AGC and constrains no channels/sampleRate — can silence pro/USB/multi-channel external interfaces. Make capture tolerant (fall back / down-mix / don't hard-require), so an external interface that works in Meet captures audio here. **Never publish a silent track silently** — verify the acquired track has energy (uses B1's level) and recover/surface if not.

Watchdog (B2b — the safety net): when mic is enabled+unmuted but energy stays ~0 for a sustained window (~4-6s), show a non-blocking in-call banner ("We can't detect sound from your microphone") with a **Switch microphone** action opening the device picker; clear when energy returns.
- Split: B2a (root-cause device+constraints) → B2b (watchdog UI). B2a is the priority.
- Proof: force a silent audio track → banner appears within the window + `micSilent:true` logged; switch to a live device → banner clears, audio flows. Deterministic via a forced-silent path (don't chase real-hardware silence).
- Likely: `media.service.ts`, `room.page.ts`, device-dialog/lobby-preview components, controls-bar.

## B3 — Diagnostics on/off switch: user toggle + global/admin kill-switch (R4, R5)
- R4: Settings toggle (default ON), persisted; gates client collection+upload. (A localStorage flag `meet-poc.diagnosticsLogging` + signal already exist but have no UI — wire a real toggle.)
- R5: global/admin master switch — admin UI toggle + backend gate; when OFF backend rejects/ignores uploads AND clients learn via the existing config/`/me` surface and stop collecting. Reuse existing admin auth (NS8).
- Proof: user toggle OFF → no POST to `/api/meeting-sessions/:id/diagnostics`; admin global OFF → backend no-ops/403 + client stops; both back ON → resumes.
- Likely: `frontend/.../pages/settings/`, `account-settings` or new diagnostics setting; `backend/src/modules/sessions/index.ts` (POST gate), admin module, a config/me field.

## B4 — All-sides attribution + surface remote audio health (R6, R7)
- R6: ensure guest samples upload reliably across reconnect; make each stored row attributable/queryable per participant (clientId/clientName/participantId already in payload — add an indexed column or a query helper so per-participant review is possible). Verify the `isAdmittedDiagnosticPoster` path doesn't drop guests after reconnect.
- R7: in the diagnostics UI, surface per-publisher inbound audio health and flag a silent remote (near-zero audio bytes + high `concealedSamples`).
- May split: B4a attribution/reliability, B4b surfacing UI.
- Proof: a 2-party call (host + guest) stores attributable samples for BOTH sides; the diagnostics view flags a forced-silent remote.
- Likely: `backend/src/modules/signaling/index.ts` (isAdmittedDiagnosticPoster), `sessions/` store + diagnostics endpoint, `frontend/.../pages/diagnostics/`.

## Dependency order
B1 → (B2, B4 depend on B1's signal/data) ; B3 independent (can follow B1). Execute B1 → B2 → B3 → B4.

## B5 — Device self-test fidelity: no false pass (R8)  [INJECTED NS10; runs after B2]
The pre-call test/configure-devices mic check must measure the SAME path the call publishes, so a non-working mic can't show "working."
- Make the lobby/preview mic test use the SAME selected device + SAME getUserMedia constraints as the call (after B2's fixes), and surface the R1 published-audio-level signal (or an equivalent measured on the exact track that will be sent), not a separate lenient meter.
- When the selected device yields no input energy for a sustained window, the test FLAGS it clearly ("No sound detected from <device> — pick another") and warns before join (don't hard-block if the user insists, but make the failure unmissable).
- Reconcile any divergence where preview grabs a different device/constraints than the call.
- Proof: with a forced-silent/wrong device, the self-test shows the FAIL flag (not a pass); with a live device it passes AND the call then transmits audio (consistency). Deterministic via forced-silent path + manual localhost note.
- Likely: lobby-preview component, device-dialog, media.service.ts, room.page.ts lobby path.
- Depends on: B1 (level signal) + B2 (capture fix). May split B5a (use real path/constraints) / B5b (flag UI).

## Revised dependency order
B1 → B2 → **B5** → B3 → B4. (B5 placed after B2 per NS10 coupling; B3/B4 follow.)

## B6 — Back-to-rooms control on /join page (R9)  [INJECTED; queue end — unrelated to audio, runs last]
The /join page (frontend/src/app/pages/join/join.page.html — currently only a "Host sign in" link) lacks a back-to-room-list control.
- Add a clear back control (arrow + "Back to rooms" / matches the lobby's existing arrowBackOutline pattern) that routes signed-in users to the rooms list route (confirm in app.routes.ts, likely /app/rooms). Guests have no room list → hide it or route to a sensible fallback (home/login).
- Proof: on /join while signed-in, the back control is visible and navigates to the rooms list; rendering matches existing back-link styling.
- Likely: join.page.html/.ts, app.routes.ts (route name only).
- Atomic SHORT (~2 files). Reuse the existing lobby back-link styling/icon.

## B2c — Multi-device mic fallback before warning (R10)  [INJECTED NS11; amends AC5; runs after B2b]
On confirmed sustained silence, sweep available mics instead of giving up after the same-device retry.
- Refactor B2a's recovery into a SHARED routine used by BOTH the join-time gate (verifyInitialCaptureEnergy) and the in-call watchdog (B2b): re-acquire current device once (relaxed) → if still silent, iterate OTHER audioinput devices (dedupe by deviceId/groupId; prefer 'default' then others; skip already-failed) → replaceAudioTrack(candidate) → sample ~1.5-2s → classifyMicCapture → adopt FIRST 'working' (update selectedAudioId + persist + notify "Switched to <label> — previous mic had no sound") → stop.
- If NO candidate works → keep best existing track (NON-DESTRUCTIVE, never zero audio) + persistent error notice ("No working microphone detected — check your mic/permissions") + offer picker.
- decideMicRecovery becomes a pure step function: given (classification, gates, candidate list, attempted set) → 'try-device <id>' | 'keep-and-warn' | 'none'. Wiring runs the bounded loop. Pure + unit-tested.
- Bounded: ONE full sweep per silence episode; re-arm only when energy returns then drops; cooldown to avoid thrash. Reuse classifyMicCapture + getOutboundAudioSource (no new meter).
- Proof: forced-silent primary + a working secondary fake-device → auto-switches to secondary (asserted) + notice; all-silent → keep track + error prompt (never zero audio); a quiet-but-working mic → NO sweep (U-8 preserved). Deterministic via fake-media; manual localhost note for real devices.
- Likely: mic-energy.ts (decision step fn), room.page.ts (shared recovery routine + gate + watchdog wiring), media.service.ts (enumerate/replace).

## Revised dependency order
B1 → B2a → B2b → B2c → B5 → B3 → B4 → B6.
