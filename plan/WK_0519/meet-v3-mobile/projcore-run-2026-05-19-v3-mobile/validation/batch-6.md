# Validation — v3-M-B6 (Operator-assisted real-device acceptance)

**Verdict:** **PASS** (iter 2 — codex hit a commit-before-DONE breach on iter 1; single-gap correction sent; clean on recommit).
**Validated by:** Claude `/projcore` (Opus), 2026-05-19.

## Gate 1 — Artifacts

All present. Two atomic commits after recommit:
- `fecbccf test: add M-B6 acceptance capture scripts` — `scripts/lighthouse-mobile.sh`, `scripts/lighthouse-mobile-fallback.mjs`, `scripts/capture-mb6-proxy-screenshots.mjs`
- `397968f docs: add M-B6 operator checklist and handoff` — `OPERATOR_SMOKE.md` + `OPERATOR_HANDOFF.md` (repo root)
- `c378e03 docs: add M-B6 evidence artifacts` — `batch-6/` evidence folder
- `27a2d37 docs: add M-B6 evidence artifacts` — second pass (callback re-append after RECOMMIT correction)

1 decision file (`2026-05-19-v3-mb6-operator-acceptance-baseline.md`). 21 proxy screenshots.

## Gate 2 — Diff review

**Iter 1 (FAIL):** codex committed scripts + root docs but left `batch-6/` evidence folder UNTRACKED. Commit-before-DONE rule broke after a 5-batch streak.

**Iter 2 (PASS):** I sent a single-gap correction (§1.3.4: implementer executes ONLY the listed gap). Codex committed batch-6 evidence + re-appended callback. Tree clean. Streak resets but discipline restored.

No application code changed this batch — operator-prep only. Per-batch boundary respected: `OPERATOR_SMOKE.md` + `OPERATOR_HANDOFF.md` + `scripts/*` + `batch-6/` artifacts. Frontend/backend untouched (codex confirmed in changes.md "No frontend or backend application code was changed").

## Gate 3 — Build

PASS — implied by green Run 1 desktop regression (Playwright runs against live build at `voice.silverjrom.app`).

## Gate 4 — Targeted + regression (R8.1 final gate)

**Independent /projcore rerun (not trusting codex's claim):**

```
npm test -w e2e -- tests/v2-b3-shell tests/v2-b4-tabs tests/v2-b5-lobby tests/v2-b6-grid tests/v2-b7-controls tests/v2-b8-sidebar --config=playwright.live.config.ts --workers=1
→ 40 passed (1.0m)
```

**Run 1 desktop regression: 40/40 PASS — R8.1 gate held 6 consecutive M-B* batches (M-B1→M-B6).**

This closes R8.1 cumulatively. Mobile work non-leaked into desktop across the entire run.

## Gate 5 — Evidence quality (5Q)

- **Q1 (real DOM or fake?)** ✓ Lighthouse runs against the live URL `https://voice.silverjrom.app/login` using Playwright Chromium as the runtime. Real backend. Proxy screenshots are captured against the same live URL. Run 1 regression is live-URL Playwright.
- **Q2 (debug-hook abuse?)** ✓ Lighthouse + Playwright captures don't use any `__meetDebug` hooks — they observe rendered DOM. Lighthouse JSON has 4 numeric category scores I independently parsed via `jq`.
- **Q3 (screenshots evidence the right thing?)** ✓ Spot-check: file sizes 13-37 KB across iPhone 14, Pixel 7, desktop — substantive PNGs, not blanks. 7 surfaces × 3 viewports = 21 screenshots (count matches brief).
- **Q4 (scenarios=tests?)** ✓ S7.x scenarios map to artifacts: S7.2→Lighthouse, S7.4→proxy screenshots, S7.1+S7.3+S7.5→OPERATOR_SMOKE.md (operator-pending). Codex correctly marks operator gates as "pending physical-device execution by JROM" — no fakery.
- **Q5 (live URL serves it?)** ✓ Live smoke `curl -s https://voice.silverjrom.app/` returns Angular `<app-root>` + `viewport-fit=cover` meta. Lighthouse audit against live URL works end-to-end.

### Lighthouse contract targets (independently verified via jq on the JSON)

| Category | Score | Target | Verdict |
|---|---|---|---|
| Performance | 0.77 (77) | ≥ 0.70 | **PASS** |
| Accessibility | 0.95 (95) | ≥ 0.85 | **PASS** |
| Best Practices | 1.00 (100) | ≥ 0.85 | **PASS** |
| SEO | 0.82 (82) | n/a | (not in contract) |

All 3 contract targets met. Codex's test-report.md framing ("below the ideal acceptance target") is unnecessarily pessimistic — perf 77 ≥ 70 PASSES the contract. Documented in the validation doc for clarity, not as a correction.

### Hygiene

Codex's Playwright screenshot capture used `--headless` and ran against the live URL — no persistent test rooms created. Lighthouse leaves no state on backend. No SQL cleanup needed this batch (per spot-check of progress.md + the screenshot capture script).

## Gate 6 — Matrix update

- R7.2 → **VERIFIED** (Lighthouse contract targets all met)
- R7.4 → **VERIFIED** (21 proxy screenshots captured)
- R8.1 → **VERIFIED** (Run 1 desktop regression 40/40 held 6 consecutive batches — cumulative)
- R8.2 → **VERIFIED** (paired desktop-unaffected specs across M-B1+M-B3+M-B4+M-B5)
- R8.4 → **VERIFIED** (mobile compromises non-leaked into desktop)
- R8.5 → **VERIFIED** (per-batch desktop-regression screenshots present)

**Matrix totals at M-B6 PASS:** **32 / 37 VERIFIED.** 4 OPERATOR-PENDING (R6.5 + R7.1 + R7.3 + R7.5 — JROM hands-on smoke). 1 ASSIGNED (R8.3 — Phase 2 fresh-context validator two-axis matrix).

## Gate 7 — Decisions

1 decision file (`2026-05-19-v3-mb6-operator-acceptance-baseline.md`) — appropriately scoped: defines the contract that proxy screenshots and Lighthouse are aids, not substitutes for real-device acceptance. Rationale + consequences both present.

## Iteration-1 retrospective: commit-before-DONE breach

The rule broke at M-B6 after a 5-batch streak. Root cause hypothesis: M-B6 is structurally different from M-B1-M-B5 (operator-prep only, no application-code commits, evidence folder is the primary deliverable not a side-effect). Codex's instinct was to commit the "primary deliverables" (scripts + root docs) and treat the evidence folder as ephemeral artifact. The single-gap correction restored discipline; recommit was clean and atomic.

Rule for future projcore runs: when a batch is operator-prep / evidence-only, the brief should explicitly enumerate the evidence folder as a separate commit checkpoint, not implicit. Logged for /jweek.

## Verdict

**PASS** — 6 reqs newly VERIFIED. **Matrix: 32 / 37 VERIFIED.** All codex-implementable requirements VERIFIED. M-B6 operator-prep artifacts are substantive and pass independent spot-checks (Lighthouse JSON parsed, screenshot file sizes verified, OPERATOR_SMOKE.md reviewed, OPERATOR_HANDOFF.md reviewed, Run 1 regression rerun GREEN).

**Run 3 implementation is now COMPLETE on the codex side.**

Next: Phase 2 fresh-context validator runs the two-axis viewport matrix against `voice.silverjrom.app` (closes R8.3). Then JROM executes `OPERATOR_SMOKE.md` on real iPhone Safari + Android Chrome (closes R6.5, R7.1, R7.3, R7.5). After both, /projcore writes the Run 3 final acceptance with ACCEPT or REJECT.
