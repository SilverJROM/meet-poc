# projcore gate — B0 (SR-0) — PASS (override of codex literal FAIL)

Commit: 0dacde5 on feat/sfu-cutover.

## Codex validator verdict: VALIDATED-FAIL (false positive)
Codex confirmed the SUBSTANCE is correct (MAX_ADMITTED 5→30, mobile cap constant/helper/rejection removed, no admit/identity/reconnect logic changed, build PASS, 3/3 cap tests PASS) but FAILED on a literal reading of my validation brief ("touches NOTHING else") because the commit also includes `B0/changes.md` + `callbacks.md`.

## projcore override → PASS
Those two files are the REQUIRED process artifacts (the implementer brief mandates changes.md + callback-first). The source scope is clean (only signaling/index.ts + the two cap tests). SR-0 is met. Codex's objection is a brief-wording artifact, not a defect.

## 7-gate
1. Artifacts — PASS (changes.md present). 2. Diff — PASS (cap raise + mobile-cap removal only; 13 source lines, mostly removals). 3. Build — PASS (codex + clean tsc). 4. Tests — PASS (3/3 cap tests). 5. Evidence quality — PASS (tests assert 6 admitted + 5 mobile admitted, proving old cap gone). 6. Req coverage — SR-0 VERIFIED. 7. Standing rules/decisions — note below.

## Process fix (carry forward)
Future per-task validation briefs to codex must say "no unrelated SOURCE/LOGIC changes" — NOT "touches nothing else" — because the implementer is required to add changes.md + the callback. Prevents repeat false-FAILs.

VERDICT: PASS. SR-0 VERIFIED. Advance to B1.
