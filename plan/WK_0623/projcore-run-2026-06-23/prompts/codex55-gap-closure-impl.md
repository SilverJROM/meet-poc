# Implementer brief — close the 2 regression-guard gaps (codex55)

**Role:** IMPLEMENTER (codex55). **Validator is a separate agent (sonnet) — do not self-certify.**
**Repo:** ~/websites/meet-poc, branch `main`. **Scope: TEST CODE + CI WIRING ONLY. Do NOT touch production source** (no edits under `backend/src`, `frontend/src/app` production files, `transcribe.py` logic, tile component, etc.). You add tests that lock the *existing* fixed behavior so a future revert goes red.

These 2 gaps are from `validation/codex55-revert-audit.md` (your own audit). Both are atomic (<30min each).

---

## GAP 1 — B1 transcription: CI-wire + extend the Python guard

**Problem:** `backend/scripts/test_owner_labeling.py` proves `label_words_with_owner` never emits `?`, but it is NOT run by `npm test` (`backend/package.json` test = `vitest run`), so reverting `transcribe.py` ships silently. It also doesn't assert the mixed-recording skip or the versioned filename.

**Do:**
1. **Extend** `backend/scripts/test_owner_labeling.py` with two more tests:
   - **skip-mixed:** the transcribe path for a recording whose participant owner is `None` (a mixed/non-per-user file) returns 0 / "skipped: not a per-user recording" and writes NO transcript. Use the real function in `transcribe.py` that performs this skip (read the script to find it — likely the main transcribe entry that calls `read_participant_owner`). Mock/stub the audio→words step so no real model/network is needed.
   - **versioned filename + owner labels + zero `?`:** for a per-user file (owner present), the written transcript path matches `<file>.transcript.local-<model>.json` (versioned naming) and every word carries the owner label, none is `?`.
2. **Wire it into CI.** Add a vitest spec `backend/tests/transcribe-python.test.ts` that shells out (`execFileSync('python3', ['scripts/test_owner_labeling.py'])` from `backend/`) and asserts exit code 0, so `npm test` (vitest run) now fails if the Python guard fails. (If `python3` is unavailable in CI, prefer `python3` then fall back to `python` — but assert the test actually ran, do not silently skip.)

**Revert-sensitivity acceptance:** if someone re-adds `speaker_for_ms` / removes owner-labeling / removes the mixed-skip in `transcribe.py`, `npm test` in `backend/` must go RED.

---

## GAP 2 — B4 cam-off background + initials: lock the tile render

**Problem:** no test asserts that a camera-off tile actually renders the selected image background + initials chip, nor the relayed `media-state.background`. Reverting the B4 tile change is invisible.

**Do:**
1. Create `frontend/src/app/components/tile/tile.component.spec.ts` (Angular TestBed, jasmine — match the existing `*.spec.ts` style in `frontend/src/app/services/`). Drive the component into **camera-off + image-background** state (set the inputs/signals that feed `camOffBackdropUrl()` and the initials) and assert the rendered DOM contains:
   - `.camera-off-avatar.has-bg-image` with a `background-image` style applied (the backdrop URL), AND
   - `.initials-chip` showing the abbreviated name.
   - Read `tile.component.ts` / `.html` first to get the exact input names, signal names, and CSS classes — use the REAL ones, do not invent.
2. **Relay assertion:** add coverage that a remote peer's `media-state.background` (`RelayPeerBackground = {kind,id}`, no image bytes) drives the same backdrop. Put this wherever it's most natural and CI-wired — a focused assertion in the tile spec if the component consumes it directly, or a small frontend service/signaling spec if the relay is handled upstream. Read the code to find where `RelayPeerBackground` is consumed and assert that path.

**Revert-sensitivity acceptance:** if the B4 backdrop/initials render or the background relay is removed, `npm test` in `frontend/` must go RED.

---

## Process
- Reproduce-first is N/A (adding tests) — but RUN each new test and confirm it PASSES against current (fixed) code before reporting. A guard test that doesn't pass on the fixed code is worthless.
- Bonus credit if you also **prove revert-sensitivity**: temporarily break the production behavior locally, confirm the test goes RED, then restore. Report what you saw. (Restore fully — leave production untouched.)
- Keep diffs tight. Test files + the one package wiring only.
- Write a `changes.md`-style summary to `plan/WK_0623/projcore-run-2026-06-23/validation/codex55-gap-closure-changes.md` (files touched, what each test asserts, the test-run output showing PASS, and any revert-sensitivity proof).

## Callback (streaming order — STATUS LAST)
When done, print the changes summary path, then the per-test pass output, then **STATUS on the final line**:
- `STATUS: DONE` — both gap tests added, CI-wired, passing on fixed code.
- `STATUS: BLOCKED <reason>` — e.g. python3 missing, TestBed harness can't reach the signal.
Do not write `STATUS: DONE` unless both `backend/` and `frontend/` test runs are green with the new tests included.
