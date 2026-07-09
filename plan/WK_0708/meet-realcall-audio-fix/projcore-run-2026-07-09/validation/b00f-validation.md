# B00F Validation — Independent L2 (sonnet, codex55-depleted backup)

**Role:** Validator L2 (sonnet)
**Independence note:** Implementer was Haiku 4.5. codex55 (originally intended L2/L3 cross-provider validator per §4b) was unavailable (usage depleted), so this validation runs on sonnet — same provider (Anthropic) as the implementer and as possible L3 escalation. **Independence loss logged**: this is a same-provider verifier≠fixer check (different model tier, not a different provider), weaker than the intended cross-provider guard. No provider-diversity signal available for this batch.
**Commit:** `7ec6151c86d29e442c1221452214879270d281a6`
**Date:** 2026-07-09

## Scope under review (per b00f-impl-brief.md)

- F2: `verifyStimulus` min-signal floor — dead-mic baseline must yield INVALID, not false PASS
- F4: port `call-ledger.test.ts` to real vitest so assertions execute under `vitest run harness/`
- F3 (optional, folded in): reconcile pre-existing stale L120 assertion in `mic-capture-health.spec.ts` (MUST-TRACK carried from B08A-1 validator, red since `856104f`)

## Checks performed (ran tests myself, did not trust changes.md claims)

### 1. Dead-mic baseline → INVALID (not false PASS)

Read `e2e/harness/gum-shim.ts`: added `MIN_BASELINE = 0.01` constant; `verifyStimulus()` now returns `undefined` when `baselineLevel < MIN_BASELINE`, in addition to the pre-existing `null`/`<=0` guards. Traced the dead-mic scenario cited in the commit message (baseline=0.005, attenuated=0.0025, measuredGain≈0.5 — within the 20% tolerance band, i.e. would have false-PASSed under the old check): `0.005 < 0.01` → `undefined` → `RecordingArbiter.determineVerdict` receives `undefined` → verdict `INVALID`.

Ran the suite directly:
```
npx vitest run e2e/harness/__tests__/gum-shim.test.ts
✓ 12 tests passed (was 11 pre-fix; new test "dead mic: noise-floor baseline below MIN_BASELINE returns INVALID not false PASS" added and asserts verdict.verdict === 'INVALID')
```
Also confirmed the real-Chromium `gum-shim.browser.test.ts` (uses actual getUserMedia levels, not synthetic) still passes — the 0.01 floor does not false-trip legitimate (non-dead) baselines used elsewhere in the harness.

**Verdict: CONFIRMED.**

### 2. call-ledger vitest port executes

Diffed pre-fix (`7ec6151^`) vs post-fix `call-ledger.test.ts`: pre-fix had 19 manual `test('name: ...', fn)` calls with a hand-rolled `assert()`; post-fix has 19 `it(...)` blocks nested under 9 `describe(...)` blocks. Extracted and diffed all 19 test names 1:1 — every original assertion name is preserved (only the `describe`-prefix moved out of the string into the block title), no test dropped, none added.

Ran directly:
```
npx vitest run e2e/harness/__tests__/call-ledger.test.ts
```
(covered inside the full-suite run below — 19/19 executed and passed under real vitest, confirmed via file diff + full-suite pass count.)

**Verdict: CONFIRMED.**

### 3. L120 matches `856104f` silent semantics

Read `classifyMicCapture()` in `frontend/src/app/services/mic-energy.ts` (the function under test, unchanged by B00F — this is a test-only fix). Confirmed current logic: on flat energy, computes `levelVariance = maxLevel - minLevel` across the window; if `< 0.005` → `'silent'` regardless of absolute level (this is exactly the `856104f` frozen-non-zero-level fix). The U-10 fixture is 6 identical samples (`audioLevel: 0.4` constant) → variance = 0 → `'silent'`.

Old L120 assertion (`notStrictEqual(..., 'silent')`) contradicted this and had been red since `856104f`, aborting the file at L120 so U-20..U-35 never executed in `vitest run` mode (confirmed by prior B08A-1 validator's MUST-TRACK note in `progress.md`). New assertion (`strictEqual(..., 'silent')`) matches actual implementation behavior.

**Independently reproduced, not just read**, by checking out the pre-fix file content into the working tree and running it directly with `tsx` (bypassing vitest's "no describe/it" quirk on this assert-based file):
```
# pre-fix (7ec6151^) content:
npx tsx frontend/src/app/services/mic-capture-health.spec.ts
→ AssertionError [ERR_ASSERTION]: flat energy + high level -> not silent
    at .../mic-capture-health.spec.ts:121:10
    actual: 'silent', expected: 'silent', operator: 'notStrictEqual'
# confirms the assertion was live and failing, not dead code

# post-fix (current, restored after the above):
npx tsx frontend/src/app/services/mic-capture-health.spec.ts
→ mic-capture-health: all assertions passed
```
File was restored to post-fix state after this check (`git diff --stat` confirmed clean, no residual change).

Note: this file is an assert-at-import script (not `describe`/`it`), so `vitest run` on it alone reports "No test suite found" — that is pre-existing file structure, not a regression; the assertions still execute (via the vitest transform/import) and the `console.log('...all assertions passed')` reached stdout in the full-suite run, confirming pass, and the direct `tsx` run above proves the fix under a vitest-independent runner too.

**Verdict: CONFIRMED — matches `856104f` semantics, independently reproduced.**

### 4. No scope creep

`git show 7ec6151 --stat`: exactly 4 code files touched (`e2e/harness/__tests__/call-ledger.test.ts`, `e2e/harness/__tests__/gum-shim.test.ts`, `e2e/harness/gum-shim.ts`, `frontend/src/app/services/mic-capture-health.spec.ts`) + the validation doc. All four map 1:1 to F2/F4/F3 in the brief. No AC files, no product/runtime code outside the harness and one test-only assertion touched. Brief said "closes no AC" — confirmed, no AC status files modified.

**Verdict: CONFIRMED — no scope creep.**

## Full-suite run (myself, not trusting changes.md)

```
npx vitest run e2e/harness/__tests__/
Test Files  10 passed (10)
     Tests  90 passed (90)
Duration    115s
```
Matches changes.md's claimed 90/90. Includes real-Chromium browser tests (gum-shim, b07 capture-injection, b08a2 sender-liveness) — all passed, no room joins (0/25 call burn per test names), no test-room cleanup required.

```
npx vitest run frontend/src/app/services/mic-capture-health.spec.ts
```
Reports "Failed Suites 1 / No test suite found" — this is the pre-existing describe/it-less-script quirk (see check 3), not a fix regression; stdout shows `mic-capture-health: all assertions passed` before the wrapper error. Cross-checked with direct `tsx` execution above.

## Verdict

**PASS**

All 4 checks confirmed, independently reproduced (not just trusting the implementer's changes.md). No scope creep. Full suite green (90/90), matching claimed count.

**Independence caveat (log for overmind/JROM, not a blocker):** L2 validation ran on sonnet, same provider as the Haiku implementer, because codex55 was depleted. This weakens cross-provider independence for this batch specifically — flagging per standing protocol, not requesting escalation to L3 since findings are unambiguous (reproduced via direct interpreter execution, not just re-reading vitest output).
