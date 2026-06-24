# Batch B5 — Independent Validation

> Status: PENDING — awaiting codex55 REPRO-CONFIRMED callback.

## Validator

Role: codex55 (independent validator, not the implementer).
Topology: 3-agent (validator ≠ implementer ≠ coordinator).

## What the validator must verify

1. **REPRO-CONFIRMED**: Reproduce the original recording loss on the unpatched branch (confirm 8s timeout and fire-and-forget per-user are the mechanism).
2. **REPRO-CLEARED**: After applying the patch, verify:
   - A real or simulated long recording completes and saves when host ends the call.
   - `close-room` is sent AFTER uploads complete (inspect WS frame ordering or server logs).
   - Per-user files present.
   - Upload failure surfaces in the leave dialog (not just console.warn).
   - localStorage key set on start, cleared on success.
3. **No regression**: Short recording path still works; international path unaffected.

## Gate

Coordinator gates batch-B5 on REPRO-CONFIRMED from this validator. Final gate waits on this file being updated with the validator's findings.

---

_This file is a placeholder — to be updated by the codex55 validator agent._
