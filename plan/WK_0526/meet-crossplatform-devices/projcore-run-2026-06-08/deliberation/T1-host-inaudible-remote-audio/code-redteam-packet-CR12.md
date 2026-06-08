# CODE RED-TEAM — round CR12 — lens L12: test integrity / meaningfulness
# (Your role = the model you run as.) STREAK 1/3 (CR11 clean) — fresh lens.
## Context
projcore independently ran the FULL suites: frontend 25/25 tsx specs PASS, ng build green, backend 166 pass (the 1 backend FAIL = signaling-reconnect, proven PRE-EXISTING via git-stash baseline, NOT our regression, not in our diff). This round audits whether the ADDED TESTS for our fixes are MEANINGFUL (would actually fail if the bug were reintroduced), not just present.
## READ the spec files in ../IMPL-prod-diff.patch: remote-audio.service.spec.ts, sfu-client.spec.ts, diagnostics.page.spec.ts, backend/tests/session-diagnostics.test.ts.
## Your task — lens L12 (evidence file:line)
For each KEY fix, is there a test that asserts the OUTCOME and would FAIL if the fix were reverted? Check meaningfulness, not just presence:
1. R1 sink-before-play ordering; R2 two-concurrent-audible; B12 late-joiner sticky-unlock; B8/voiceStalled banner-latches-on-stall + clears-on-emission; B13 no-autoplay; B14 reset clears registry+unlocked; CR-fix-2 latch non-sticky (clears on bytes-flat/no-energy/mutedAll); CR-fix-3 sink fallback honest; CR-fix-4 ended-track guard + negative-stat reject + unsupported-sink; CR-fix-5 mid-conflict no-permanent-stop + per-publisher energy; CR-fix-6 blocked/blockedReason agree; CR-fix-8/9 clientKey stripped store+read (old-row legacy test).
2. Any fix with NO test, or a test that would still pass if the fix were reverted (i.e. asserts attempt not outcome, or wrong level)? Name it.
3. Are the tests deterministic (no Date.now/random/timing flakiness)? Any test that's actually a no-op?
## Output `<role>-coderedteam-CR12.md`:
```
# <role> CODE red-team CR12 (lens L12: test integrity)
## Fix-by-fix test coverage: each = meaningful-test / weak-or-missing (file:line)
## Any fix that could be reverted with tests still green? (the gap)
## NEW bugs / test gaps (table) or "none"
STATUS: CLEAN — tests are meaningful + cover the fixes   OR   STATUS: BUGS — <worst gap>
```
Honest CLEAN if clean.
