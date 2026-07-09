# Validator L2 codex55 — B02

Independent gate. Do not fix.

## Acceptance
Synthetic known WAV round-trip: recording analysis + RMS/LUFS + ratio API + INVALID when stimulus verification missing. Stats never sole PASS.

## Procedure
1. Read recording-arbiter.ts + tests + b02-changes.md
2. Run: npx tsx e2e/harness/__tests__/recording-arbiter.test.ts
3. Confirm computeLoudnessRatio is explicit quiet/normal (not loudest-remote)
4. Confirm INVALID third verdict exists and is used when stimulus missing
5. Write validation/b02-validation.md PASS|FAIL

Emit: [projcore callback] validator B02 STATUS: DONE — PASS|FAIL
