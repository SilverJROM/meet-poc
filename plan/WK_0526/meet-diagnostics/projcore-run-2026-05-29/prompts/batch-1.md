Batch-1: Local mic-energy metric into diagnostics

Invoke /lead. You are NOT /projcore for this dispatch — you are the hyper-focused IMPLEMENTER. Claude /projcore is supervising from another session and will independently validate. Do ONE thing: this batch. No scope creep.

Batch ID: B1
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Plan: <run-dir>/implementation-plan.md  (read B1 section)
Requirements: R1 (see <run-dir>/og-requirements.md)
North-star anchors: NS2 (hyper-focused, no drift), NS4 (post-live, deferral tight — no TODO/FIXME, finish the slice), NS5 (test strategy), NS7 (branch).
Branch: create feat/meet-diagnostics-audio-20260529 off current HEAD (81661dd) and work there.
Lifecycle: post-live — Deferral OFF. No TODO/FIXME, no "follow-up PR," no dead-code shims. Uncertainty → STATUS: NEEDS-CLARIFICATION.
Estimated: SHORT (<30min, atomic).

Context:
The app persists WebRTC diagnostics per call to the meeting_session_diagnostics table (client POSTs to /api/meeting-sessions/:sessionId/diagnostics). The diagnostics SAMPLE payload is built in frontend room.page.ts buildDiagnosticsPayload (~line 2428) and includes fields outboundAudioLevel, outboundAudioEnergy, micSilent — but these are NULL in 100% of all 1,561 stored samples. They are never populated. That is the #1 blind spot preventing us from diagnosing a silent microphone at the source (a remote user's mic that isn't actually capturing audio).

Requirements section (verbatim from og-requirements.md):
"R1 — Local mic-energy metric populated on ALL clients (host + guests). Every diagnostic `sample` must carry real, non-null `outboundAudioLevel`, `outboundAudioEnergy`, and `micSilent`. (Today: null in 100% of samples.) This is the source-side signal that proves whether a participant's mic is actually capturing audio."

Observed (current state — verify yourself):
- room.page.ts buildDiagnosticsPayload sets outboundAudioLevel/outboundAudioEnergy/micSilent (likely hardcoded null or reading a signal that's never fed).
- A live mic meter may already exist (project_specs notes a lobby mic meter / B5 input-activity surface). FIND it and reuse its analyser rather than adding a second AudioContext on the same track.
- media.service.ts owns the local stream / audio track.

Expected (acceptance criteria — concrete, observable):
1. While in a call with the mic ENABLED and producing sound, diagnostic `sample` rows have non-null outboundAudioLevel (>0 on real input) and outboundAudioEnergy, and micSilent === false.
2. While the mic is MUTED (track.enabled=false) OR the captured track is producing no audio energy, samples have micSilent === true (and level ~0).
3. This works for ANY client (host and guest) — the metric is computed client-side from the local audio track, not gated on isOwner/login.
4. No second/leaked AudioContext: reuse the existing meter if present; if you add an analyser, it is created once per local audio track and torn down on track replace / call end (no leak, no duplicate).
5. The values are sampled at (or near) the diagnostics sample cadence so each uploaded sample reflects the mic state at that moment.

Scope:
- Implement ONLY R1: compute + thread the local mic-energy signal into the diagnostics payload for all clients.
- Do NOT build the silent-mic warning UI (that is B2). Do NOT touch the on/off switch (B3) or attribution/diagnostics-view (B4).
- Do NOT change the SFU/transport, room layout, or unrelated code. Surgical only — no "while I'm in here."
- Robust polled assertions: assert the OUTCOME (a sample payload actually carries non-null values in the running app / a unit test on the payload builder), not just that a function fired.
- Escape valve: headless WebRTC can't capture real mic audio — prove micSilent/level logic deterministically (e.g. unit-test the payload builder with a fed level, + a manual localhost note for the live path). Don't chase real-hardware audio in CI.
- If you hit a wall, STATUS: BLOCKED with specifics — do not spiral.

Plan handshake (MANDATORY before writing code):
1. Read this brief + referenced files (room.page.ts buildDiagnosticsPayload, media.service.ts, any existing mic meter).
2. Reply with PROPOSED: mechanism-level diagnosis (where the nulls come from, what analyser/signal you'll use), planned files, risks, confirm SHORT.
3. End with: STATUS: PROPOSED — <one-line approach>.
4. WAIT for projcore APPROVED-PLAN before coding. If REVISE-PLAN, address gaps, re-emit PROPOSED.

After APPROVED-PLAN:
5. Implement. 6. Build green (cd backend && npm run build ; cd ../frontend && npm run build). 7. STATUS: DONE — <summary>.

Required artifacts (under <run-dir>/):
- validation/B1/scenarios.md, changes.md (User Report verbatim + Root Cause mechanism + per-file WHY), review.md, test-report.md, independent-validation.md
- decisions/<date>-<slug>.md for any non-trivial autonomous call, else state "Autonomous decisions: none."

Completion protocol:
- Write the callback FIRST: append '[projcore callback] B1 <STATE> <note>' to <run-dir>/callbacks.md BEFORE your prose reply.
- End EVERY reply with a dedicated line: STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>. Bare tokens don't reach projcore.
