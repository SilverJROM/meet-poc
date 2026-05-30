Batch-2: ROOT-CAUSE the silent microphone capture (device + constraints), then add the watchdog

Invoke /lead. You are the hyper-focused IMPLEMENTER for ONE batch (B2). Claude /projcore supervises from another session and validates independently. NO scope creep.

Batch ID: B2
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Plan: <run-dir>/implementation-plan.md (read B2 section)
Requirements: R2, R3 (see og-requirements.md) + north-star NS9 (root-cause mandate) + NS4 (deferral OFF) + NS5 (tests) + NS2 (hyper-focused).
Branch: CONTINUE on feat/meet-diagnostics-audio-20260529 (currently @ 3c1ebff, B1 landed). Commit B2 on top.
Lifecycle: post-live — Deferral OFF. No TODO/FIXME, no "follow-up PR." Uncertainty → STATUS: NEEDS-CLARIFICATION.
Estimated: likely > SHORT — PROPOSE A SPLIT (B2a root-cause device+constraints, B2b watchdog UI) in your PROPOSED if it's >30min/sprawling.

THE PROBLEM (verbatim context):
A US user with an EXTERNAL mic joined a call. He could hear others; others could NOT hear him. He TESTED his mic (working) and it worked on Google Meet. Forensics on 1,561 diagnostic samples: the silent peers delivered 45-441 audio packets for a whole call with 0% packet loss but 60-95% concealment, while their VIDEO flowed normally. 0% loss + healthy video ⇒ the link/SFU were fine; the audio never left their mic. JROM: "is it the code? go ham." ⇒ The hardware is good; THE SILENT CAPTURE IS OUR BUG. Root-cause it.

Requirements (verbatim):
"R2 — Silent-mic detection + actionable warning. When a participant's mic is enabled and unmuted but no audio energy is detected for a sustained window (uses R1's signal), the app warns them with a non-blocking, actionable prompt ('We can't detect sound from your microphone') and offers to switch microphone (opens the device picker). Clears when audio is detected."
"R3 — Robust microphone selection (external mic actually used). The user's chosen input device is used on join and in-call; on a silent/failed default the app does not silently publish a dead track — it attempts recovery and/or surfaces R2. An external mic that works in Google Meet must be selectable and capture audio here."

ROOT-CAUSE FIRST (B2a — the real fix). Investigate and fix in OUR capture path. Prime suspects (verify each with file:line before fixing — diagnose mechanism, don't guess):
- (a) DEVICE SELECTION: does the picker's chosen deviceId actually reach getUserMedia on JOIN, and persist lobby→in-call? Where do we fall back to the system default? `audioConstraints()` uses `deviceId:{exact}` (media.service.ts ~line 357) — if the exact device is PRESENT but produces silence (wrong channel / not the one he tested), getUserMedia does NOT throw, so we publish a silent track with no error. Trace acquire()/preflight()/replaceAudioTrack()/ensureSelectedAudioDevice()/applyLobbyMicPreference().
- (b) CONSTRAINTS: `AUDIO_PROCESSING_CONSTRAINTS` (media.service.ts ~line 34) forces echoCancellation/noiseSuppression/autoGainControl and constrains nothing on channelCount/sampleRate. Pro/USB/multi-channel external interfaces can yield a silent/wrong channel under these exact constraints; Meet negotiates around it. Consider making EC/NS/AGC non-fatal / tolerant and handling multi-channel.
- (c) NEVER PUBLISH A SILENT TRACK SILENTLY: after acquiring/replacing the audio track, verify it actually carries energy (reuse B1's signal — see below) within a short window; if silent, attempt recovery (re-acquire, try without exact-deviceId / relaxed constraints / different device) and/or surface R2 instead of going live mute.

WATCHDOG (B2b — safety net): when mic is enabled+unmuted but energy stays ~0 for a SUSTAINED window (~4-6s, to avoid flicker on natural speech pauses/DTX), show a NON-BLOCKING in-call banner ("We can't detect sound from your microphone") with a "Switch microphone" action that opens the existing device picker; clear when energy returns.

REUSE B1 (mandatory — consistency):
- The local published-audio level is now available: `deriveOutboundAudioFields` / `outboundAudioSource` (frontend/src/app/services/mic-energy.ts) and the diagnostics `outboundAudioLevel`/`micSilent` fields. Use this SAME signal + `MIC_SILENCE_LEVEL_THRESHOLD` (0.01) for the watchdog and the post-acquire energy check. Do NOT invent a second meter / AudioContext.

Scope guards:
- B2 ONLY (R2, R3). Do NOT touch: the diagnostics on/off switch (B3), attribution/diagnostics-view (B4), the device self-test/lobby-test redesign (B5 — that's next, separate), the /join back button (B6).
- Do NOT change the SFU/transport/signaling, room layout, or unrelated code. Surgical only.
- Auth/RBAC = out of scope (none needed here).
- Robust polled assertions: assert the OUTCOME (banner appears / track recovered / micSilent reflected), not just that a function fired.
- Deterministic proof: force a silent/wrong audio track (e.g. a muted or zero-signal MediaStreamTrack) → assert the watchdog banner appears within the window AND/OR recovery triggers; switch to a live track → banner clears. Headless can't capture a real mic — use the forced-silent path + a Playwright fake-media (the e2e harness uses fake-media flags, which DO emit a tone) where it adds real value. Don't chase real-hardware silence.
- If you hit a wall, STATUS: BLOCKED with specifics — don't spiral.

Plan handshake (MANDATORY):
1. Read this brief + the files (media.service.ts FULLY, room.page.ts device/lobby paths, device-dialog + lobby-preview components, sfu-client publish/addTransceiver, mic-energy.ts).
2. Reply PROPOSED: mechanism-level ROOT-CAUSE diagnosis (which of (a)/(b)/(c), with file:line evidence — what EXACTLY makes us capture/publish silence), planned fix, planned watchdog, planned split (B2a/B2b), risks, estimate.
3. End: STATUS: PROPOSED — <one-line>.
4. WAIT for projcore APPROVED-PLAN before coding. REVISE-PLAN → address gaps → re-emit.

After APPROVED-PLAN: implement → build green (backend + frontend) → STATUS: DONE.

Required artifacts under <run-dir>/validation/B2/: scenarios.md, changes.md (User Report verbatim + Root Cause MECHANISM with file:line + per-file WHY), review.md, test-report.md, independent-validation.md, screenshots/ (banner states). decisions/ entry for any non-trivial call.

Completion protocol:
- Write the callback to <run-dir>/callbacks.md FIRST: '[projcore callback] B2 <STATE> <note>'.
- End EVERY reply with: STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>.
