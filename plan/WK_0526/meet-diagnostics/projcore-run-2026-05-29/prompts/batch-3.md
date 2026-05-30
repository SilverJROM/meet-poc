Batch-3: Diagnostics on/off switch — user toggle + global/admin kill-switch (R4, R5)

Invoke /lead. You are the hyper-focused IMPLEMENTER for ONE batch (B3). Claude /projcore supervises and validates independently. NO scope creep.

Batch ID: B3
Run dir: /home/agjrom/websites/meet-poc/plan/WK_0526/meet-diagnostics/projcore-run-2026-05-29
Read FIRST: context-handoff.md, og-requirements.md R4+R5, implementation-plan.md B3, north-star NS8 (admin guard).
Requirements: R4, R5. North-star: NS8 (reuse existing admin auth — NO new RBAC boundary), NS4 (deferral OFF), NS5 (tests), NS2.
Branch: CONTINUE on feat/meet-diagnostics-audio-20260529 (currently @ 2c062ff). Commit B3 on top.
Lifecycle: post-live, Deferral OFF.
Estimated: MEDIUM (~40min). PROPOSE a split B3a (R4 user toggle) / B3b (R5 admin global) if >30min.

WHY (JROM, verbatim): "just add an on/off switch to these diagnostics so that when we are at a certain point we can just off these"

Requirements (verbatim):
"R4 — User-level diagnostics on/off toggle. A visible toggle in Settings (default ON). When OFF, that client stops collecting AND uploading diagnostics. Persisted."
"R5 — Global/admin diagnostics kill-switch. A master switch (admin/global) so diagnostics can be turned off globally. When OFF: backend stops accepting/persisting diagnostics AND clients learn to stop collecting (via the existing config/me surface). Reuses existing admin auth — NO new auth/RBAC boundary."

Current state (verify with file:line):
- A localStorage flag `meet-poc.diagnosticsLogging` + a `diagnosticsLoggingEnabled` signal ALREADY exist (room.page.ts ~181 + ~2669) and already gate queueDiagnosticsLog/flushDiagnosticsLog — but there is NO UI to toggle them. R4 = wire a real Settings toggle to this existing flag.
- Settings page: frontend/src/app/pages/settings/ (has sub-tabs Account/LLM/Transcribe). account-settings component exists.
- Backend diagnostics POST: /api/meeting-sessions/:sessionId/diagnostics in backend/src/modules/sessions/index.ts, gated by isAdmittedDiagnosticPoster (signaling). No global on/off exists.
- Admin module EXISTS (frontend admin.guard + pages/admin; backend admin module) with admin auth. Migrations under backend/migrations/.

Expected (acceptance criteria — concrete, observable):
R4 (user toggle):
1. A visible, labeled toggle in Settings (default ON), persisted, wired to the EXISTING diagnosticsLoggingEnabled / meet-poc.diagnosticsLogging flag.
2. Toggle OFF → the client stops BOTH collecting and POSTing diagnostics (no POST to /api/meeting-sessions/:id/diagnostics); ON → resumes. (Reuse the existing gate; just expose it.)
R5 (global/admin kill-switch):
3. A global diagnostics-enabled setting, toggleable AT RUNTIME from the admin tab (PREFER a DB-backed admin setting over an env var, so no redeploy needed — but justify your choice). Reuses existing admin auth/guard (NS8 — no new boundary).
4. When global = OFF: the backend REJECTS/IGNORES diagnostics POSTs (no persistence), AND clients learn via the existing config/me surface (or an equivalent already-fetched config) and STOP collecting client-side (don't just rely on the server dropping them).
5. When global = ON (default): behavior unchanged.
6. Precedence: global OFF wins over a user ON (global is a kill-switch).

Scope guards:
- B3 ONLY (R4, R5). Do NOT touch the B2 audio paths, B4 attribution, B6, SFU/transport, layout beyond the settings/admin toggles.
- NS8: reuse the EXISTING admin module + auth. Do NOT invent a new auth/RBAC boundary. If R5 can't be done without touching auth, STATUS: NEEDS-CLARIFICATION.
- If you add a migration, it must be idempotent (CREATE TABLE IF NOT EXISTS / ALTER ADD COLUMN) per project_specs.
- Robust polled assertions — assert the OUTCOME (no POST when off; backend 4xx/no-op + client stops when global off; resumes when on).
- Deterministic proof: backend vitest for the global-gate (POST rejected/ignored when off, accepted when on); frontend unit/logic for the toggle gating + global-precedence. Manual localhost note for the end-to-end Settings/admin UX.
- If you hit a wall, STATUS: BLOCKED with specifics.

Plan handshake (MANDATORY):
1. Read brief + handoff + the existing flag (room.page.ts), settings page, admin module (frontend guard + backend), sessions diagnostics POST, config/me endpoint.
2. Reply PROPOSED: R4 wiring; R5 mechanism (DB setting vs env — justify), where the backend gate goes, how clients learn (config/me field), global-vs-user precedence, planned files/migration, split decision, risks, estimate.
3. End: STATUS: PROPOSED — <one-line>.
4. WAIT for projcore APPROVED-PLAN. REVISE-PLAN → fix → re-emit.

After APPROVED-PLAN: implement → build green (backend + frontend) → STATUS: DONE.

Artifacts under <run-dir>/validation/B3/: scenarios.md, changes.md, review.md, test-report.md, independent-validation.md, screenshots/. decisions/ entry for the DB-vs-env choice.

Completion protocol:
- Write callback to <run-dir>/callbacks.md FIRST: '[projcore callback] B3 <STATE> <note>'.
- End EVERY reply with: STATUS: <PROPOSED|APPROVED-PLAN|REVISE-PLAN|DONE|BLOCKED|NEEDS-INFO> — <reason>.
