# Batch B1a — Independent Validation

> Status: PENDING — awaiting codex55 REPRO-CONFIRMED callback.

## Validator

Role: codex55 (independent validator, not the implementer).
Topology: 3-agent (validator ≠ implementer ≠ coordinator).

## What the validator must verify

1. **REPRO-CONFIRMED**: On pre-fix mixed transcript (`AGENTROOM_dc411e`), confirm `?` speaker present in `lines[].name`.
2. **REPRO-CLEARED**: After patch:
   - Re-transcribe a per-person fixture → transcript JSON has zero `?` labels; all names = file owner.
   - Mixed webm `POST .../transcribe` → 400; `transcribe.py` skips mixed.
   - `GET named-transcript/:sessionId` → merged lines owner-labeled, time-sorted, no `?`.
   - Transcripts page "Meeting transcript" loads merge.
3. **No regression**: Per-file "Track" view still works; mixed download unaffected.

## Gate

Coordinator gates batch-B1a on validator REPRO-CONFIRMED / REPRO-CLEARED.

---

_Placeholder — to be updated by the codex55 validator agent._