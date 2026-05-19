# progress.md — meet-poc rebuild

Live state of the run. Codex appends callbacks here (format: `[projcore callback] batch-<n> <STATE> <note>`).

## Run state

- **Started:** 2026-05-19
- **Coordinator:** Claude `/projcore`
- **Implementer:** Codex (`$lead`) in `lkvcdx-39`
- **Pattern:** 2 (supervisor-across-tmux)

## Phase 0 — contract lock (in progress)

- 2026-05-19 — /projcore wrote `og-requirements.md` (50 numbered reqs)
- 2026-05-19 — /projcore wrote `scenarios.md` (40 scenarios mapped to reqs)
- 2026-05-19 — /projcore wrote `project_specs.md` (architectural truth)
- 2026-05-19 — /projcore wrote `implementation-plan.md` (B0-B6 + branches + dependencies)
- 2026-05-19 — /projcore wrote `queue.md` + `req-matrix.md` + this file
- 2026-05-19 — /projcore initialized `prompts/`, `validation/`, `corrections/`, `decisions/`
- 2026-05-19 — /projcore logged stack-choice + REST-over-GraphQL decisions to JROM/decisions/
- 2026-05-19 — /projcore logged JROM-raised issue to `plan/WK_0519/list/`

## Batch states

| Batch | State | Iter | Dispatched | Callback | Validated | Verdict |
|-------|-------|------|------------|----------|-----------|---------|
| B0 | DONE | 1 | 2026-05-19 | (self) | (self) | PASS |
| B1 | DONE | 1 | 2026-05-19 | 2026-05-19 01:18 | 2026-05-19 01:22 | PASS |
| B2 | DONE | 1 | 2026-05-19 01:25 | 2026-05-19 01:33 | 2026-05-19 01:38 | PASS |
| B3 | DONE | 1 | 2026-05-19 01:41 | 2026-05-19 01:51 | 2026-05-19 01:56 | PASS |
| B4 | DONE | 1 | 2026-05-19 01:58 | 2026-05-19 02:07 | 2026-05-19 02:15 | PASS (commit-process correction, 2m 15s to close) |
| B5 | DISPATCHING | — | — | — | — | — |
| B3 | PENDING | — | — | — | — | — |
| B4 | PENDING | — | — | — | — | — |
| B5 | PENDING | — | — | — | — | — |
| B6 | PENDING | — | — | — | — | — |

## Callbacks log

(codex appends here)

[projcore callback] batch-1 DONE — backend scaffold + auth module + tests green
[projcore callback] batch-2 DONE — rooms CRUD + signaling protocol + 12 scenarios green
[projcore callback] batch-3 DONE — Angular SPA shell with auth + dashboard; 8 scenarios green; meet-poc-fe up
[projcore verdict] batch-1 PASS — 9 reqs VERIFIED (R1.1-R1.7 + R8.1 partial + R10.2); see validation/batch-1.md. Flag: codex must write decisions/ entries per §1.15, not only changes.md§Autonomous Decisions. Retroactively logged 2026-05-19-b1-legacy-recordings-path.md.
[projcore verdict] batch-2 PASS — 13 reqs VERIFIED (R2.1-R2.5 + R3.1-R3.8); wire format identity verified at 3 levels (test/source/live smoke); intentional setState fix for legacy state-tracking bug documented in decisions/2026-05-19-b2-admitted-state-transition.md; B1 gate-7 flag closed (codex now logs per-run decisions/ files). See validation/batch-2.md.
[projcore verdict] batch-3 PASS — 10 new VERIFIED + 2 PARTIAL; S3.5 stitched-symptom-absent closes JROM's verbatim complaint at requirements level (.toHaveCount(0) on login form selectors after auth). Angular 20 + signals + lazy routes + Ionic + REST/HttpClient; scripts/serve.js consolidated at :4710. 3 decisions logged (proxy-and-webserver, room-placeholder for S3.7, angular-cdk version). Backend regression: 12/19 still green. Playwright B3 8/8 green independently. See validation/batch-3.md.
[projcore callback] batch-4 DONE — room page (lobby + call) + WebRTC client + 8 scenarios green
[projcore correction] batch-4 — work was uncommitted on STATUS: DONE; asked codex to commit atomically (no code changes). Codex closed in 2m 15s with 3 commits (1 feat + 2 docs).
[projcore verdict] batch-4 PASS — 8 new VERIFIED + 1 PARTIAL (R5.2 STUN done, coturn → B6). Full-mesh P2P proven by S4.3 two-context (2.7s) `connected` both ways. Backend regression 12/19 + B3 regression 8/8 + B4 8/8 all green on independent rerun. 4 decisions logged. See validation/batch-4.md. Soft-flag for future briefs: "commit before posting STATUS: DONE callback" should be explicit.
