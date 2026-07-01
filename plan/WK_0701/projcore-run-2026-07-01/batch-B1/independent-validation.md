# Batch B1 — Independent Validation Checklist

Validator (codex55): reproduce on rendered app first, then audit tests for honest bug repro.

## Backend fault injection

1. Set `SFU_FAULT_INJECT=1` and rules JSON targeting a test participant.
2. `POST /api/sfu/tracks` with matching `participantId` + `trackName` → **406** without CF credentials/network.
3. Confirm `faultInjected: true` in body; production `NODE_ENV` path does not inject.

## Frontend BUG-REPRO (tsx)

```bash
cd frontend && npx tsx src/app/services/sfu-repro-harness.spec.ts
cd frontend && npx tsx src/app/services/sfu-recovery-epoch.spec.ts
```

Audit that each test:

- Names/comments include `BUG-REPRO-R1`
- Asserts **terminal outcome** (not merely that HTTP was called once)
- Would **fail** if client escalates to rejoin/self-heal (B2 desired behavior)

## Stall give-up

```bash
cd frontend && npx tsx src/app/pages/room/room-decisions.spec.ts
```

- BUG-REPRO-R1-mark-stalled block (~L300) must pass before any pre-existing failure later in file.

## Build gate

```bash
npm run build
```