# DIAGB1 Scenarios

## DR-6 Quick Join
- PASS: Pre-join renders compact self-preview, name input, microphone toggle, camera toggle, and Join / Ask to join.
- PASS: Full FIXC2 device dialog is absent by default.
- PASS: Test / configure devices expands the reused FIXC2 device dialog with VU, speaker test, and device selectors.

## DR-7 Validation And Setup Errors
- PASS: Empty public join attempt shows inline "Enter your name to join" and focuses the name input.
- PASS: Permission-denied media preflight shows explicit microphone access recovery copy.
- PASS: ICE config fetch failures are surfaced as a clear fallback warning while preserving STUN fallback.

## DR-9 Live Waiting-To-Join Updates
- PASS: Host already in call receives a later waiting guest without reload.
- PASS: Backend keeps the legacy `knock` message and also broadcasts authoritative `pending-list` snapshots to owners on pending changes.
- PASS: Frontend treats `pending-list` as authoritative and keeps the waiting list current.

## DR-10 Doorbell
- PASS: Host receives one debug-counted doorbell for a genuinely new late knocker.
- PASS: Non-admitted/non-admitting participant does not get a doorbell.
- PASS: Initial/replayed pending-list snapshot does not ring for already-waiting knockers.
