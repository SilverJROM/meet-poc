# Decision — Call budget RESET to 0 / 25 (JROM, 2026-07-09)

**Source:** JROM chat (authoritative; supersedes `decisions/2026-07-09-budget-50.md`)
**Quote:** "RESET: callBurnCount 0→25 fresh budget. Ledger cleaned. Proceeding B00S-BUDGET + AC1. 30-min check-ins armed."

## Binding

| Field | Value |
|---|---|
| `DEFAULT_CALL_BURN_CAP` | **25** (supersedes 50) |
| `callBurnCount` | **0** (fresh; supersedes 49/58 pollution) |
| Remaining acceptance | **25** |
| Check-in cadence | **30 min** (armed) |
| Next | Cap code 50→25 if still 50; continue B08/AC1 |

## Actions taken by projcore

1. Canonical `ledger-state.json` reset: callBurnCount=0; createdIDs cleared (fresh run hygiene; protected IDs remain hard-blocked in code).
2. `e2e/ledger-state.json` aligned to 0.
3. `call-log.jsonl` reset entry appended / file rotated with reset event.
4. B00S-BUDGET mechanism (conditional burn + logCall + fail-closed) remains VERIFIED; only **cap number + counter** changed by JROM reset.
5. In-flight B08 notified: still acceptanceAttempt:false for sweep; full 25 headroom available for later AC gates.

## Supersession

- Prior: cap 50, burn 49 (`1fdc6c0`, budget-50 decision) — **voided** for operational counter/cap.
- Mechanism commits `d33eb22`+`1fdc6c0` stay; only DEFAULT_CALL_BURN_CAP must return to 25 in code.
