# B01 SEND-BACK iter 2 — implementer L2 haiku

One remaining fail-open:

`getState()` does `createdIDs: [...currentState.createdIDs]` — array shell copied, but **LedgerEntry objects are still live**. Mutating `state.createdIDs[0].id = 'object-mutated-uncaptured'` then `canDelete('object-mutated-uncaptured')` returns true.

## Fix
Return a **deep copy** of every entry object, e.g.
`createdIDs: currentState.createdIDs.map(e => ({ ...e }))`
or structuredClone / JSON round-trip of the full state.

## Test
Adversarial: register legit id; getState(); mutate returned entry.id; canDelete(mutated) must be false; canDelete(original) still true.

## Handshake
Short PROPOSED → wait APPROVED-PLAN → fix → commit →  tests → [projcore callback] impl B01 STATUS: DONE
