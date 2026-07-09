# B07 Validator L3 opus (verifier ≠ fixer — sonnet implemented)

## MANDATORY D27 / evidence-class (FAIL if violated)
- Scaffold ≠ PASS for ACs that require live recording/transcript/live room call.
- AC4/AC5 require far-end transcript after recovery on a real call — B07 must NOT close them.
- T_gap=3400ms VOID. T_gap_provisional=500ms may not close any AC.
- Dropout ≠ inter-utterance pause.
- Burn only browser+room joins.

## B07 acceptance (mechanism only)
- Mode A hold = frozen non-zero signature on real track
- Mode B hold = silent on real track  
- Post-switch measurable speech-level change
- Real Chromium proof without claiming AC4/AC5 VERIFIED

## Procedure
1. Read VALIDATOR-EVIDENCE-CLASS-RULE.md + decisions/b07-findings.md + b07-changes.md
2. Run: cd e2e && npx vitest run harness/__tests__/b07-capture-injection.test.ts harness/__tests__/b07-capture-injection.browser.test.ts
3. Confirm AC4/AC5 explicitly OPEN
4. Write validation/b07-validation.md PASS|FAIL for B07 scope only

Callback: [projcore callback] validator B07 STATUS: DONE — PASS|FAIL
