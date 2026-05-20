Batch-DIAGZ: Full modularization audit (DR-24) — FINAL batch

Batch ID: diagz
Requirement: DR-24 (full text in og-requirements.md)
Branch: continue on fix/meet-conn-diag.

**Protocol: projcore v2.0.** Plan handshake first (PROPOSED → APPROVED-PLAN → work). Append `[projcore callback] diagz <STATE> <note>` to callbacks.md as the final action of each STATUS reply. End with `STATUS: <verb> — <reason>`.
**ENV-HYGIENE still applies** if you run any test that touches pm2/DB: no exported MEET_DB_PATH/MEET_RECORDINGS_DIR leak; clean ecosystem restart only.

## DR-24 — Modularization audit (gated on DR-1..25, now all VERIFIED)

JROM: "i want a full audit on the modularization of the app so that fixing one section does not break another section." This is the FINAL deliverable. It is primarily an ANALYSIS + REPORT batch — **do NOT perform sweeping refactors; JROM reviews findings before any refactor is applied.**

Deliverables:
1. **Architecture/coupling report** at `plan/WK_0519/meet-fixes/projcore-run-2026-05-20-conn/batch-diagz/modularization-audit.md`:
   - Map the modules: backend (signaling, rooms, recording, transcription, llm, questions, ice-config, auth, sessions) + frontend (room.page, services: webrtc/ws/media/active-speaker/recorder/ice-config, components, pages).
   - Identify CROSS-SECTION COUPLING + risk: where does a change in one area break another? Call out: shared mutable state, implicit ordering dependencies, god-objects (room.page.ts and webrtc.service.ts have grown large across DR-1..25 — quantify LOC + responsibilities), duplicated logic, leaky abstractions, and any place where the recent batches added cross-cutting state.
   - Rank the top coupling risks by blast-radius (what's most likely to cause "fix one thing, break another").
2. **Prioritized refactor recommendations** — for each top risk: the proposed seam/extraction/isolation, estimated effort (S/M/L), risk, and the benefit. DO NOT apply them — list them for JROM to approve.
3. **Cheap, SAFE boundary guards you MAY add now** (low-risk, no behavior change): e.g., a few boundary/contract regression tests or type seams that lock current behavior so future changes are caught. Only if genuinely low-risk; otherwise list them as recommendations. Anything beyond trivial → defer to JROM.

## Scope

- Analysis + report + (optional) trivial safe guards ONLY.
- DO NOT refactor production behavior, move modules, or change APIs without JROM approval — list those as recommendations.
- Do NOT regress DR-1..25.

## Plan handshake (MANDATORY)

STATUS: PROPOSED with: your audit approach, which modules/files you'll analyze, how you'll measure coupling (imports, shared state, god-object LOC/responsibility count), and what (if any) trivial safe guards you'd add vs defer. Append callback. Wait for APPROVED-PLAN.

## Required artifacts at plan/.../batch-diagz/

modularization-audit.md (the report — the main deliverable), changes.md (if any guards added), test-report.md (if guards added), independent-validation.md, decisions/<date>-*.md (or "none").

## Build + deploy

- If you add any guard tests: backend/frontend build PASS + tests PASS (clean DB, env-hygiene). If pure analysis: no deploy needed.
- Do NOT deploy refactors (none should exist without JROM approval).

## Completion

COMMIT BEFORE STATUS: DONE (the report + any guards). End with `STATUS: DONE — <reason>` + append `[projcore callback] diagz DONE <note>`. The report is the deliverable; projcore will surface the findings + refactor recommendations to JROM.
