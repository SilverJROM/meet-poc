Batch-4: All-sides attribution + surface remote audio health (R6, R7)

Invoke /lead. Hyper-focused IMPLEMENTER for ONE batch (B4). Claude /projcore supervises + validates. NO scope creep.

Batch ID: B4
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Read FIRST: context-handoff.md, og-requirements.md R6+R7, implementation-plan.md B4.
Requirements: R6, R7. North-star: NS4 (deferral OFF), NS5 (tests), NS2.
Branch: CONTINUE feat/meet-diagnostics-audio-20260529 (@ 2c36c86). Commit on top.
Lifecycle: post-live, Deferral OFF.
Estimated: MEDIUM (~40min). PROPOSE split B4a (R6 attribution/reliability — backend) / B4b (R7 surface UI) if >30min.

WHY: This run started because we COULDN'T prove a silent remote at the source. The diagnostics must let a host review EVERY side of a call and SEE a silent remote at a glance.

Requirements (verbatim):
"R6 — Guest/all-sides reliability + per-participant attribution. Guest participants' diagnostics upload reliably for the whole call (incl. across reconnect), and each stored sample is attributable to the specific participant (clientId / clientName / participantId) and queryable — so a host can review every side of a call, not just their own."
"R7 — Surface remote audio health in the diagnostics view. The existing per-publisher inbound stats (bytesReceived, packetsReceived, concealedSamples) are surfaced in the diagnostics UI so a silent remote is visible at a glance (a peer with near-zero audio bytes + high concealment is flagged), not buried in JSON."

Current state (verify with file:line):
- meeting_session_diagnostics: owner_email = session host_email ALWAYS; payload_json holds clientId/clientName/participantId + sfuDiagnostics.inboundTracks[{publisherClientId,kind,bytesReceived,packetsReceived,concealedSamples,...}]. Insert = appendDiagnosticsEntry (sessions/store.ts).
- Guests DO currently upload (data shows Caily/Jtest/etc.), gated by isAdmittedDiagnosticPoster (signaling/index.ts) — but VERIFY reliability across reconnect (the gate's clientIdentities/wasAdmitted path).
- Diagnostics view: frontend/src/app/pages/diagnostics/ (lists sessions + entries; backend /api/sessions diagnostics endpoints in sessions/index.ts).

Expected (acceptance criteria — concrete, observable):
R6:
1. Each diagnostic row is attributable to its participant and QUERYABLE — add indexed column(s) (e.g. participant_client_id, participant_name) populated from the payload on insert (idempotent ALTER ADD COLUMN migration; new rows populated; existing rows may stay null — note it). A host can retrieve a session's diagnostics grouped/filterable BY participant.
2. Verify guest samples upload reliably across a reconnect (the isAdmittedDiagnosticPoster path doesn't drop a guest after their socket churns). If a real gap exists, fix it; if it's already robust, prove it with a test + note.
R7:
3. The diagnostics view surfaces, per remote publisher, the inbound audio health (bytesReceived, packetsReceived, concealedSamples) and FLAGS a silent remote — the exact bug signature: near-zero audio bytes + high concealment ratio + (now) the source-side micSilent — so a host sees "this participant was silent" at a glance, not by reading JSON.

Scope guards:
- B4 ONLY (R6, R7). Do NOT touch B2 audio paths, B3 toggle/killswitch, B6, SFU/transport, the in-call UI. Surgical.
- Migration idempotent (ALTER TABLE ADD COLUMN; guard re-runs).
- A flag THRESHOLD for "silent remote" — reuse the same spirit as classifyMicCapture (near-zero bytes/packets + high concealment); justify the numbers; expose them as named constants, don't hardcode magic inline.
- Robust polled assertions — assert the OUTCOME (a row is queryable by participant; the view flags a forced silent-remote fixture).
- Deterministic proof: backend test (attribution columns populated on insert; query-by-participant; guest-across-reconnect admittance); frontend logic/unit for the silent-remote flag classifier over fixture inbound stats. Manual note for the rendered view.
- If you hit a wall, STATUS: BLOCKED.

Plan handshake (MANDATORY):
1. Read brief + handoff + appendDiagnosticsEntry/store, sessions diagnostics endpoints, isAdmittedDiagnosticPoster, the diagnostics page.
2. Reply PROPOSED: attribution mechanism (columns + populate + query), reconnect-reliability finding (gap or already-robust + how proven), R7 flag classifier + threshold + where in the view, split decision, files/migration, risks, estimate.
3. End: STATUS: PROPOSED — <one-line>. WAIT for APPROVED-PLAN.

After APPROVED-PLAN: implement → build green (BE+FE) → STATUS: DONE.

Artifacts under <run-dir>/validation/B4/: scenarios.md, changes.md, review.md, test-report.md, independent-validation.md, screenshots/. decisions/ entry for threshold/attribution choices.

Completion protocol:
- Callback to <run-dir>/callbacks.md FIRST: '[projcore callback] B4 <STATE> <note>'.
- End EVERY reply with STATUS: <...> — <reason>.
