# B01 SEND-BACK iter 1 — Implementer L2 haiku

Validator FAIL (codex55). Required suite still 15/15 but adversarial checks found fail-open edges.
Do NOT re-litigate — fix these three issues only.

## Findings (must fix)
1. `registerCreatedID('room', '')` then `canDelete('')` returns **true** — empty IDs must be rejected at register AND canDelete.
2. `registerCreatedID('room', '   ')` then `canDelete('   ')` returns **true** — whitespace-only IDs must be rejected (trim; empty after trim = reject).
3. `getState().createdIDs.push(...)` mutates live state so uncaptured IDs become deletable — `getState()` must return a **deep copy / frozen snapshot**, never the live array reference.

## Also add tests
- reject empty ID register + canDelete false
- reject whitespace-only register + canDelete false  
- getState() mutation does not authorize canDelete for pushed IDs

## Handshake
PROPOSED first (short), wait for APPROVED-PLAN, then fix + atomic commit + re-run tests.
Write update to validation/b01-changes.md (append fix note).
Emit: [projcore callback] impl B01 STATUS: DONE — <note>

Read current e2e/harness/call-ledger.ts and validator report:
plan/WK_0708/meet-realcall-audio-fix/projcore-run-2026-07-09/validation/b01-validation.md
