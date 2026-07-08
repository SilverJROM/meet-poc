# Batch B1 — Test Report

## Commands

```bash
cd frontend && npx tsx src/app/services/mic-sweep.spec.ts
cd frontend && npm run build
```

## Results

| Command | Exit | Outcome |
|---------|------|---------|
| `npx tsx src/app/services/mic-sweep.spec.ts` | 0 | `mic-sweep: all assertions passed` |
| `npm run build` | 0 | Build complete; only pre-existing warnings (Stencil empty-glob, mediapipe CJS) |

## New assertions (CR1 adapter planner)

- `sweepInProgress` blocks gate consumption — state identity preserved
- `recoveryInFlight` blocks gate consumption — state identity preserved
- `micActive=false` after delayed sample re-arms without consumption
- Eligible silent consumes exactly once (`attempts: 0 → 1`, `shouldSweep: true`)
- Stale silent window classifies `'silent'`; cleared window classifies `'indeterminate'`
- `micSilenceWatchdogBannerMessage`: retry vs exhausted vs null for non-silent

## Regression

All pre-existing reducer tests (U-15–U-19, R1 cooldown, dual-bound, disjointness) and B2c sweep orchestrator tests remain green.

## Coordinator Re-Run

2026-07-05T22:14Z:

| Command | Exit | Outcome |
|---------|------|---------|
| `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts` | 0 | `mic-sweep: all assertions passed` |
| `cd frontend && npm run build` | 0 | Build complete; same known warnings: Stencil empty-glob, mediapipe CJS |

---

## CR2 correction (batch-B1-cr2, 2026-07-05T22:19Z)

| Command | Exit | Outcome |
|---------|------|---------|
| `cd frontend && npx tsx src/app/services/mic-sweep.spec.ts` | 0 | `mic-sweep: all assertions passed` |
| `cd frontend && npm run build` | 0 | Build complete; pre-existing warnings only |

### New assertions (CR2 blocked planner)

- `working + recoveryInFlight` re-arms to `INITIAL_SWEEP_GATE_STATE`
- `working + sweepInProgress` re-arms to `INITIAL_SWEEP_GATE_STATE`
- `micActive=false + recoveryInFlight` re-arms without consumption
- Exhausted silent under `recoveryInFlight`: `exhausted === true`, state unchanged, no launch/consume

### Regression

All CR1 adapter tests and pre-existing reducer/sweep tests remain green.
