# Validator brief — independently verify the 2 gap-closure tests (sonnet)

**Role:** VALIDATOR (sonnet). You are NOT the implementer (codex55 wrote these tests). Verifier ≠ fixer — do not fix anything; report PASS/FAIL with evidence. **Repo:** ~/websites/meet-poc, branch `main`.

The implementer added 2 regression-guard tests to close gaps from `validation/codex55-revert-audit.md`. Your job is to confirm they actually do what JROM asked: **"reverting the issue would be caught on the tests."** A test that merely passes is not enough — it must FAIL when the fix is reverted.

Read `validation/codex55-gap-closure-changes.md` first (implementer's summary of what they touched).

## Checks

### 1. Scope hygiene
`git diff --stat main` (or `git status`) — confirm the implementer touched **test files + CI wiring ONLY**. Any edit to production source (`backend/src/**`, `frontend/src/app/**` non-spec, `backend/scripts/transcribe.py` LOGIC) is a FAIL — flag it.

### 2. Green on fixed code
- `cd backend && npm test` — confirm the new transcribe python guard runs (it must actually execute python3, not skip) and the suite is green.
- `cd frontend && npm test` (or the project's frontend test cmd) — confirm the new tile.component.spec runs and is green.
- Capture the lines showing the NEW tests ran and passed.

### 3. Revert-sensitivity proof — THE KEY CHECK (do this yourself, independently)
For EACH gap, temporarily break the production behavior, run the guarding test, confirm it goes **RED**, then `git checkout` to restore. Do not leave any production edit behind.
- **GAP 1 (B1):** in `backend/scripts/transcribe.py`, temporarily sabotage owner-labeling or the mixed-skip (e.g. make `label_words_with_owner` emit `?`, or make the mixed path NOT skip). Run `backend` tests → the python guard MUST fail. Restore.
- **GAP 2 (B4):** in the tile component, temporarily remove/blank the `camOffBackdropUrl()` backdrop or the `.initials-chip` render. Run `frontend` tests → the tile spec MUST fail. Restore.
- If a test stays GREEN after you break the fix → that gap is NOT actually closed → FAIL with the exact reason.

### 4. Verdict
Write to `plan/WK_0623/projcore-run-2026-06-23/validation/sonnet-gap-closure-verdict.md`:
- Per-gap: scope OK?, green-on-fixed?, revert→RED proven? (paste the failing assertion line you triggered).
- Final line: `VERDICT: PASS` (both gaps green-on-fix AND red-on-revert, scope clean) or `VERDICT: FAIL — <what>`.

End your terminal callback with `STATUS: VALIDATED` or `STATUS: REJECTED <reason>` on the final line.
