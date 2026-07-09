# Validator L3 (opus) — B08A-1

Verifier ≠ fixer. You did NOT implement. sonnet implemented → you gate.

## Batch scope
AC15a product: extractOutboundLiveness + getOutboundLiveness (ONE getStats) + D29 diagnostics emit of totalAudioEnergy, totalSamplesDuration, packetsSent, bytesSent per outbound audio track.
Commits: 0ca6670, d7edd39. Closes NO AC (AC15 only at B08A-3).

## Evidence class
Unit/fixture tests + code read of diagnostics payload path. Not UI-visible AC. Live call NOT required for this batch.

## Gate checks
1. Q0: map batch acceptance → assertions present (four counters, null-safe, one getStats, diagnostics fields on audio outbound track).
2. Run/confirm tests for sfu-client.spec.ts new cases + extractOutboundLiveness cases.
3. Confirm classifyMicCapture/R1 untouched.
4. Confirm no second getStats in collectDiagnostics path for this emit.
5. Note pre-existing mic-capture-health.spec.ts failure at L120 if still present — not a B08A-1 FAIL if unrelated.
6. Redteam CLEAN already.

Write validation/b08a1-validation.md with PASS|FAIL + evidence.
Callback: [projcore callback] validator B08A-1 STATUS: DONE — PASS|FAIL — <note>
