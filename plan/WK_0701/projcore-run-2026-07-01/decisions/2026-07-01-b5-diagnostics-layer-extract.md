# Decision — Extract diagnostics helpers (batch-B5)

**Date:** 2026-07-01  
**Batch:** B5

## Decision

Extract `diagnosticsGumError()` to `diagnostics-gum-error.ts` and layer assembly to `diagnostics-layer-snapshot.ts` instead of keeping logic inline in `room.page.ts`.

## Why

- Enables outcome-focused unit tests without bootstrapping `RoomPage`.
- Keeps `room.page.ts` diff surgical (wire-only in `buildDiagnosticsPayload`).
- Reuses B1 `isLastGumErrorCandidate` at the single gate for `lastGumError`.

## Alternatives considered

- Gate only at `recordLastGumError()` — rejected; `diagnosticsGumError()` is the canonical mapper and must be testable directly.
- Rename/remove flat `lastGumError` — rejected; additive `layerDiagnostics` preserves backward compat for existing diagnostics consumers.