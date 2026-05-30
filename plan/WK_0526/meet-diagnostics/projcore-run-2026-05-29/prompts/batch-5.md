Batch-5: Device self-test fidelity — no false pass (R8)

Invoke /lead. You are the hyper-focused IMPLEMENTER for ONE batch (B5). Claude /projcore supervises and validates independently. NO scope creep.

Batch ID: B5
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Read FIRST: context-handoff.md (B1+B2 summary), og-requirements.md R8, implementation-plan.md B5, north-star NS10.
Requirements: R8. North-star: NS10, NS4 (deferral OFF), NS5 (tests), NS2 (hyper-focused).
Branch: CONTINUE on feat/meet-diagnostics-audio-20260529 (currently @ 4a50da2). Commit B5 on top.
Lifecycle: post-live, Deferral OFF. Uncertainty → STATUS: NEEDS-CLARIFICATION.
Estimated: SHORT-MEDIUM (~30min). Propose a split only if genuinely >30min.

WHY (JROM, verbatim): "perhaps one thing to add here or fix is to properly fix the self test on the user, if its truly not sending it should be flagged ... its unacceptable to pass that and yet when on a call it does not work"
The US user's pre-call mic test showed "working" but the call transmitted silence — a FALSE PASS.

Requirement (verbatim):
"R8 — Device self-test fidelity (no false pass). The pre-call 'test/configure devices' mic check (lobby/preview) must measure the same capture path the call will publish — same selected device, same getUserMedia constraints, and the same published-audio-level signal used by diagnostics (R1) — so a microphone that will NOT transmit on the call cannot show as 'working' in the test. When no input energy is detected from the selected device for a sustained window, the test clearly flags it ('No sound detected from <device> — pick another') and warns the user before they join. The pre-call test result must match in-call reality."

KEY TECHNICAL CONSTRAINT (verify, then design around it):
- In the LOBBY there is NO SFU peer-connection/sender yet (pre-publish), so `getOutboundAudioSource()` (media-source/getStats) — the in-call energy reader — is NOT available there. So B5 CANNOT simply reuse the in-call reader. Find the EXISTING lobby mic meter (likely media.service.ts getMicLevel / an AnalyserNode on the local preview stream) — that is the false-passing surface to fix.
- The FIDELITY fix = make the lobby capture identical to the call's capture: SAME selected device + SAME `audioCaptureConstraints` (the {ideal} builder B2a added). If the lobby currently acquires with different constraints / no deviceId / a different stream than the call, that mismatch is the false-pass root — fix it so the lobby track == what the call will publish.
- Apply the SAME silence classification: reuse the pure `classifyMicCapture` (it takes EnergySample{totalAudioEnergy,audioLevel}) by feeding it the lobby's AnalyserNode-derived energy over a sustained window (build EnergySample-shaped readings from the analyser — running cumulative energy + instantaneous level), so the lobby silence verdict uses the same logic as the in-call watchdog. Do NOT invent a different/looser threshold.

Expected (acceptance criteria — concrete, observable):
1. The lobby/preview mic self-test acquires with the SAME device + SAME audioCaptureConstraints as the call (verify the acquire paths match; fix any divergence).
2. The test classifies mic activity over a SUSTAINED window using classifyMicCapture-equivalent logic (flat cumulative energy + low level ⇒ silent), NOT a one-frame "any level" check.
3. A mic that produces no energy is clearly FLAGGED in the test ("No sound detected from <device> — pick another"), shown before join; a quiet-but-working mic (rising energy) is NOT flagged (preserve the U-8 property).
4. The test verdict matches in-call reality: a device that the in-call watchdog/sweep would classify silent also fails the lobby test (no false pass).
5. Non-blocking: the user can still proceed, but the failure is unmissable; selecting a working device clears the flag.

Scope guards:
- B5 ONLY (R8). Do NOT touch B3/B4/B6, the in-call B2 paths (they're done/deployed), SFU/transport, layout. Surgical.
- Reuse classifyMicCapture + audioCaptureConstraints (no new threshold, no second capture path).
- Robust polled assertions — assert the OUTCOME (test shows FAIL flag for a silent device; PASS + matching in-call for a live device).
- Deterministic proof: unit-test the lobby energy→classification mapping (feed analyser-shaped silent vs rising-energy samples → flagged vs not). Headless can't capture a real mic (fake-media emits a tone) → real-device fidelity = manual localhost:4700 note (NS5). Do NOT fabricate a fake-media test.
- If you hit a wall, STATUS: BLOCKED with specifics.

Plan handshake (MANDATORY):
1. Read brief + handoff + the EXISTING lobby mic-test/meter code (find it; cite file:line) + media.service.ts acquire/constraints + mic-energy.ts.
2. Reply PROPOSED: where the false-pass comes from (lobby vs call capture divergence, with file:line), how you'll align device+constraints, how you'll feed classifyMicCapture from the analyser, the flag UI, planned files, risks, estimate.
3. End: STATUS: PROPOSED — <one-line>.
4. WAIT for projcore APPROVED-PLAN. REVISE-PLAN → fix → re-emit.

After APPROVED-PLAN: implement → build green (backend + frontend) → STATUS: DONE.

Artifacts under <run-dir>/validation/B5/: scenarios.md, changes.md (Root Cause mechanism + per-file WHY), review.md, test-report.md, independent-validation.md, screenshots/. decisions/ entry if any non-trivial call.

Completion protocol:
- Write callback to <run-dir>/callbacks.md FIRST: '[projcore callback] B5 <STATE> <note>'.
- End EVERY reply with: STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>.
