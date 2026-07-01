# Batch B1 — Self Review

## Scope adherence

- ✅ Reproduction harness + BUG-REPRO tests only (R1)
- ✅ No subscribe recovery logic changes (B2 scope)
- ✅ Fault injection env-gated; `NODE_ENV === 'production'` disables inject
- ✅ Outcome assertions (guard latched, `advertised-not-subscribed`, `mark-stalled` persistence) — not one-shot call counters alone

## Risks / caveats

- `sfu-client.spec.ts` pre-existing failure untouched; harness isolated in `sfu-repro-harness.spec.ts`
- `room-decisions.spec.ts` has unrelated pre-existing failure after B1 block
- Orphaned subscribe backoff timers may remain after cap (give-up outcome still correct — guard blocks re-subscribe)

## Verdict

READY for independent validation.